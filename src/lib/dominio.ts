// Metadados de dominio para a UI (rotulos pt-BR e cores de badge). NAO e regra
// de negocio — a fonte da verdade dos estados/transicoes e o Postgres (0004) e
// os validadores Zod (src/lib/validators/movimentacao.ts). Aqui so mora a
// apresentacao. Identificadores de dominio em pt sem acento (CLAUDE.md).
import type { Enums } from '@/lib/types/database'

export type StatusAtivo = Enums<'status_ativo'>
export type TipoMovimentacao = Enums<'tipo_movimentacao'>
export type CategoriaAtivo = Enums<'categoria_ativo'>
export type TermoStatus = Enums<'termo_status'>

// ---------- STATUS ----------
// Cores por grupo (spec §6.3 / OS-F2 3.1.1): em_uso azul-claro, em_estoque
// verde-claro, manutencao ambar, descartado cinza, defasado neutro. Os demais
// (reservado, emprestado, em_triagem) recebem cores distintas coerentes.
//
// F19-pós — POR QUE o VERDE usa `text-*-800` e os irmãos usam `text-*-700`:
// medido, `green-700` sobre `green-100` da o par mais fraco da familia inteira,
// 4,4996:1 — reprova AA por 0,0004 nos 11px do badge. Os demais passam
// (violeta 6,13 · azul 5,59 · teal 4,79 · ciano 4,71 · laranja 4,56 · ambar 6,41
// no 800 · cinza 6,11 · slate 8,40), entao so o verde desceu um degrau, para
// `green-800` (6,45:1). Nao e inconsistencia: e o mesmo ALVO de contraste com a
// tinta que cada matiz exige. Confira com `node scripts/contraste.mjs`.
//
// F40 — AS CLASSES DEIXARAM DE ESCREVER PALETA. Onde se lia
// `bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300`, lê-se
// `bg-selo-em-estoque text-selo-em-estoque-texto`: os tokens vivem em
// `src/app/globals.css` com os MESMOS valores oklch, copiados do `theme.css` do
// Tailwind. Nenhuma cor mudou (as 18 razões estão medidas em `contraste.mjs`,
// item `F40`, e batem casa decimal por casa decimal com os pares crus).
//
// POR QUE ISSO IMPORTA: a régua media uma LISTA de 73 pares e a cor morava em
// 555 classes espalhadas por 60 arquivos. Enquanto for `bg-green-100` escrito no
// JSX, nenhum teste distingue "verde de status" de "verde qualquer" — e famílias
// em uso sem par nenhum (emerald, sky) entravam sem passar por régua alguma.
//
// O NOME DA FAMÍLIA É O DO PRIMEIRO DONO, e ela é REUSADA por quem compartilha a
// mesma tinta: `TIPO_PILL.compra` e `TIPO_LANC_PILL.liberacao` vestem
// `--selo-em-estoque`; `TIPO_LANC_PILL.retorno` veste `--selo-troca` (o mesmo
// teal que a F15 já lhes dava). O compartilhamento não é novo — só ficou
// visível. `defasado` continua em `bg-muted`, que já era token: são NOVE
// famílias, não dez.
export const STATUS_META: Record<
  StatusAtivo,
  { rotulo: string; badge: string }
> = {
  em_estoque: {
    rotulo: 'Em estoque',
    badge:
      'bg-selo-em-estoque text-selo-em-estoque-texto border-transparent',
  },
  reservado: {
    rotulo: 'Reservado',
    badge:
      'bg-selo-reservado text-selo-reservado-texto border-transparent',
  },
  em_uso: {
    rotulo: 'Em uso',
    badge:
      'bg-selo-em-uso text-selo-em-uso-texto border-transparent',
  },
  emprestado: {
    rotulo: 'Emprestado',
    badge:
      'bg-selo-emprestado text-selo-emprestado-texto border-transparent',
  },
  // F32/RV-02 — a triagem trocou de família (laranja → rosa). NÃO é gosto: o
  // laranja `#ea580c` do GRÁFICO media ΔE 1,6 sob deutanopia contra o âmbar
  // vizinho `#d97706` da manutenção (piso 8) e 6,7 em visão normal (piso 15) —
  // par indistinguível. O rosa era a única família de matiz livre no sistema. O
  // BADGE acompanha o gráfico porque a promessa da fase é uma cor só por status
  // em toda superfície: tile → segmento → badge → glossário. Par medido:
  // 5,01:1 claro · 8,28:1 escuro (`node scripts/contraste.mjs`).
  em_triagem: {
    rotulo: 'Em triagem',
    badge:
      'bg-selo-em-triagem text-selo-em-triagem-texto border-transparent',
  },
  em_manutencao: {
    rotulo: 'Em manutenção',
    badge:
      'bg-selo-em-manutencao text-selo-em-manutencao-texto border-transparent',
  },
  defasado: {
    rotulo: 'Defasado',
    badge: 'bg-muted text-muted-foreground border-transparent',
  },
  descartado: {
    rotulo: 'Descartado',
    badge:
      'bg-selo-descartado text-selo-descartado-texto border-transparent',
  },
  // F14: baixa terminal — o fornecedor ficou com o equipamento (não teve conserto).
  // Cinza-neutra de baixa, distinta do descartado (slate vs gray).
  devolvido_fornecedor: {
    rotulo: 'Devolvido ao fornecedor',
    badge:
      'bg-selo-devolvido-fornecedor text-selo-devolvido-fornecedor-texto border-transparent',
  },
}

export function rotuloStatus(s: StatusAtivo): string {
  return STATUS_META[s]?.rotulo ?? s
}

// Cor de gráfico por status (barras empilhadas de estoque — F3B). Escala
// categórica distinta; `em_uso` é o azul da marca (token único --color-brand-azul,
// mesma cor da 2ª série dos gráficos). Desde a F32 este mapa deixou de ser "cor
// das empilhadas" e virou a LÍNGUA do status na página inteira: acento dos KPI
// tiles, barra do acervo, segmentos, swatch do glossário. Consumido como fill
// SVG / style.background / config de chart — todos aceitam CSS var.
//
// F32/RV-02 — três matizes trocados por MEDIÇÃO (análise de 10/08 §4: simulação
// Machado–Oliveira–Fernandes 2009 severidade 1.0 + distância OKLab ×100 entre
// vizinhos ADJACENTES na ordem em que os segmentos se tocam, STATUS_ORDEM):
//   · `em_triagem` #ea580c → #db2777 — o par com `em_manutencao` media ΔE 1,6
//     sob deutanopia (piso 8) e 6,7 em visão normal (piso 15). O pior possível.
//   · `reservado` #7c3aed → #6d28d9 — um degrau mais escuro afasta do azul
//     vizinho (deutan 5,2 → 7,6).
//   · `emprestado` #0891b2 → #06b6d4 — um degrau mais claro afasta do azul em
//     visão normal (9,9 → 17,5).
// Resultado da pilha: pior par CVD 7,6 · pior par em visão normal 17,1. O ciano
// mede 2,43:1 contra o card, abaixo do piso 3:1 de elemento gráfico — alívio
// registrado em `scripts/contraste.mjs`: o segmento carrega rótulo direto,
// total na ponta, legenda e tooltip, quatro canais além da cor.
//
// ARMADILHA: `fillRotuloSegmento` (rotulo-grafico.ts) só sabe converter hex e os
// tokens listados em TOKEN_PARA_HEX. Cor nova aqui é hex literal OU entra lá —
// senão a luminância vira 0 e o rótulo sai branco sobre fundo claro, em silêncio.
//
// F40 — os nove hex saíram daqui e viraram `--grafico-<familia>` em
// `src/app/globals.css`, com os MESMOS valores: nenhuma cor mudou, mudou o
// endereço. Os nove estão em TOKEN_PARA_HEX, e `src/lib/dominio/cores.test.ts`
// prova que os dois lados não divergem — é a mesma disciplina das travas TS↔SQL
// da casa. Trocar a tinta de gráfico um dia passa a ser editar uma linha do CSS.
export const STATUS_CHART_COLOR: Record<StatusAtivo, string> = {
  em_estoque: 'var(--grafico-em-estoque)',
  reservado: 'var(--grafico-reservado)',
  em_uso: 'var(--grafico-em-uso)',
  emprestado: 'var(--grafico-emprestado)',
  em_triagem: 'var(--grafico-em-triagem)',
  em_manutencao: 'var(--grafico-em-manutencao)',
  defasado: 'var(--grafico-defasado)',
  descartado: 'var(--grafico-descartado)',
  devolvido_fornecedor: 'var(--grafico-devolvido-fornecedor)',
}

// ---------- TIPO DE MOVIMENTACAO ----------
export const TIPO_META: Record<TipoMovimentacao, { rotulo: string }> = {
  compra: { rotulo: 'Compra' },
  troca: { rotulo: 'Troca' },
  saida: { rotulo: 'Saída' },
  emprestimo: { rotulo: 'Empréstimo' },
  reserva: { rotulo: 'Reserva' },
  devolucao: { rotulo: 'Devolução' },
  // F34 — a triagem virou manual: `envio_triagem` é a ENTRADA (em_estoque →
  // em_triagem) e `triagem_ok` continua sendo a SAÍDA (em_triagem → em_estoque).
  envio_triagem: { rotulo: 'Envio para triagem' },
  triagem_ok: { rotulo: 'Triagem OK' },
  envio_manutencao: { rotulo: 'Envio p/ manutenção' },
  retorno_manutencao: { rotulo: 'Retorno de manutenção' },
  marcar_defasado: { rotulo: 'Marcar defasado' },
  descarte: { rotulo: 'Descarte' },
  transferencia: { rotulo: 'Transferência' },
  ajuste: { rotulo: 'Ajuste' },
  estorno: { rotulo: 'Estorno' },
  devolucao_fornecedor: { rotulo: 'Devolução ao fornecedor' },
}

export function rotuloTipo(t: TipoMovimentacao): string {
  return TIPO_META[t]?.rotulo ?? t
}

// Guardas de vocabulário para texto vindo DE FORA (querystring, sessionStorage).
// `'toString' in TIPO_META` é **true** — todo objeto herda as chaves de
// `Object.prototype` —, então o `in` deixava passar `?tipo=toString`, que depois
// estoura em `CAMPOS_POR_TIPO[tipo].campos` e derruba o passo 2. `hasOwnProperty`
// pergunta o que se queria perguntar. (F26; o `in` vinha da F10.)
export function ehTipoMovimentacao(v: unknown): v is TipoMovimentacao {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(TIPO_META, v)
}

export function ehStatusAtivo(v: unknown): v is StatusAtivo {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(STATUS_META, v)
}

// Rótulo do ativo SEM patrimônio físico (F7E). É regra de apresentação do
// DOMÍNIO, não de uma tela: a F26 chegou a ter duas funções homônimas (`nomeDe`)
// em módulos diferentes, e o literal já estava copiado inline em vários arquivos
// desde antes dela.
//
// O fluxo de nova movimentação (`components/movimentacoes/**`) está TODO por
// aqui — mudar o rótulo é um gesto só nessas telas. Fora dele ainda há cópias
// inline (ficha do ativo, paleta de comandos, termos, devolução ao fornecedor,
// `actions/ativos.ts`): dívida conhecida, para migrar quando cada tela for
// tocada. Cuidado ao migrar `ativos/`: dois componentes de lá já declaram um
// `rotuloPatrimonio` local — um com esta mesma semântica, outro com semântica
// DIFERENTE ("Definir/Corrigir patrimônio") —, e o import ficaria sombreado em
// silêncio.
export function rotuloPatrimonio(p: string | null | undefined): string {
  return p ?? 'sem patrimônio'
}

// Pílula colorida da coluna Tipo nas tabelas de relatório (OS-F3 3.3.5):
// saída amarela, devolução azul, compra verde, troca teal; os demais tipos, neutro.
// F15: `troca` (nascimento do substituto) é distinta da `compra` (verde) — teal, com
// variante escura (AA claro/escuro, precedente F7F; mesmo teal de TIPO_LANC_PILL.retorno).
//
// F19 — saida/devolucao/compra nasceram sem par `dark:` (só `troca` tinha). Com o
// tema escuro ligado isso vira texto escuro sobre pílula clara cravada no card
// escuro. Pares idênticos aos de STATUS_META e TIPO_LANC_PILL, logo abaixo:
// bg-*-100 → dark:bg-*-950 · text-*-700|800 → dark:text-*-300.
// (O `compra` usa 800 pelo mesmo motivo medido do `em_estoque` — ver STATUS_META.)
const TIPO_PILL: Partial<Record<TipoMovimentacao, string>> = {
  saida: 'bg-selo-em-manutencao text-selo-em-manutencao-texto',
  devolucao: 'bg-selo-em-uso text-selo-em-uso-texto',
  compra: 'bg-selo-em-estoque text-selo-em-estoque-texto',
  troca: 'bg-selo-troca text-selo-troca-texto',
}

// Neutro dos tipos sem cor própria. F19 — era `bg-muted text-muted-foreground`,
// que mede 4,34:1 e reprova AA nos 11px em que a pílula é renderizada. O par
// `gray-200/gray-600` (6,11:1 claro · 5,64:1 escuro) é o MESMO já usado pelo badge
// "descartado" de STATUS_META — reaproveitar mantém a família visual do neutro.
const PILL_NEUTRA =
  'bg-selo-descartado text-selo-descartado-texto'

export function pillTipo(t: TipoMovimentacao): string {
  return TIPO_PILL[t] ?? PILL_NEUTRA
}

// ---------- CATEGORIA ----------
export const CATEGORIA_META: Record<CategoriaAtivo, { rotulo: string }> = {
  notebook: { rotulo: 'Notebook' },
  desktop: { rotulo: 'Desktop' },
  monitor: { rotulo: 'Monitor' },
  celular: { rotulo: 'Celular' },
  tablet: { rotulo: 'Tablet' },
  outro: { rotulo: 'Outro' },
}

export function rotuloCategoria(c: CategoriaAtivo): string {
  return CATEGORIA_META[c]?.rotulo ?? c
}

// Ordem canonica para selects/filtros (segue os enums do banco).
export const STATUS_ORDEM: StatusAtivo[] = [
  'em_estoque',
  'reservado',
  'em_uso',
  'emprestado',
  'em_triagem',
  'em_manutencao',
  'defasado',
  'descartado',
  'devolvido_fornecedor',
]

// ---------- QUEM ESTA COM O EQUIPAMENTO (F36) ----------
// Os estados em que ALGUEM esta com o ativo. Em todo o resto ele esta com a TI
// (ou nao existe mais), e colaborador/setor sao apagados pelo trigger
// `aplicar_movimentacao` — a regra pergunta ao ESTADO RESULTANTE, nao ao TIPO da
// movimentacao (decisao D1 do Johnny, 28/08/2026).
//
// ⚠ ESTE MAPA E ESPELHO, NAO FONTE. A fonte da verdade e a funcao
// `public.status_tem_detentor` (migration 0110). `detentor-sql.test.ts` le a
// migration e recusa divergencia — mesma tecnica de `transicoes-sql.test.ts`.
// Aqui mora so a apresentacao/derivacao no cliente (ex.: explicar por que o campo
// "Colaborador" some, ou por que um ajuste vai limpar o detentor).
export const STATUS_COM_DETENTOR: readonly StatusAtivo[] = [
  'em_uso',
  'emprestado',
  'reservado',
]

/** Alguem esta com o equipamento neste estado? (espelho de `status_tem_detentor`) */
export function statusTemDetentor(s: StatusAtivo): boolean {
  return STATUS_COM_DETENTOR.includes(s)
}

export const CATEGORIA_ORDEM: CategoriaAtivo[] = [
  'notebook',
  'celular',
  'monitor',
  'desktop',
  'tablet',
  'outro',
]

// ---------- ITEM POR QUANTIDADE (F3B) ----------
export type GrupoItem = Enums<'grupo_item'>
export type TipoLancamento = Enums<'tipo_lancamento'>

export const GRUPO_ITEM_META: Record<
  GrupoItem,
  { rotulo: string; titulo: string }
> = {
  acessorio: { rotulo: 'Acessório', titulo: 'Acessórios e periféricos' },
  componente: { rotulo: 'Componente', titulo: 'Componentes' },
}

export function rotuloGrupoItem(g: GrupoItem): string {
  return GRUPO_ITEM_META[g]?.rotulo ?? g
}

export const GRUPO_ITEM_ORDEM: GrupoItem[] = ['acessorio', 'componente']

// UM VOCABULÁRIO SÓ, COM AS PALAVRAS DO ATIVO (F41 · decisão J1, 31/08/2026).
//
// Os VALORES do enum continuam imutáveis — renomear reescreveria a leitura de todo
// lançamento histórico e de todo relatório congelado. O que mudou foi o RÓTULO, e
// mudou porque o item e o ativo diziam nomes diferentes para a mesma função, com
// TRÊS colisões ao contrário (dor D1 do docs/PLANO-ITENS.md):
//
//   · `saida` era "Liberação" no item e "Saída" no ativo — mesmo valor, dois nomes;
//   · `liberacao` era rotulado "Devolução" enquanto "Liberação" era o rótulo de
//     OUTRO tipo (`saida`) — o comentário de `actions/erros.ts` já registrava uma
//     mensagem que precisou ser reescrita por causa disso;
//   · "Atrelar" descrevia exatamente o que o operador queria ("este item acompanha
//     o equipamento") e fazia outra coisa: prendia a unidade a um CHAMADO, que só
//     um `liberacao` do mesmo chamado soltava. Foi a segunda metade da dor D2.
//
// A reconciliação anterior (F6A §A4, 16/07/2026) tentou dar nome próprio a cada
// tipo; esta desiste disso e usa as palavras que o operador já conhece do ativo:
//   entrada→Compra · saida→Saída · retorno→Devolução · ajuste→Ajuste
// O par reserva/liberacao SAI DA TELA (só histórico) e passa a ler-se
//   reserva→Reserva · liberacao→Devolução de reserva
// — legível para quem abrir um lançamento antigo, e impossível de escolher por
// engano, porque `escolha-tipo.ts` não os oferece mais.
export const TIPO_LANCAMENTO_META: Record<
  TipoLancamento,
  { rotulo: string; descricao: string }
> = {
  entrada: { rotulo: 'Compra', descricao: 'Compra/recebimento — soma ao total e ao estoque.' },
  saida: { rotulo: 'Saída', descricao: 'Item fica com a pessoa — baixa o estoque; o total continua.' },
  reserva: { rotulo: 'Reserva', descricao: 'Separado para um chamado e vai voltar — baixa o estoque.' },
  liberacao: { rotulo: 'Devolução de reserva', descricao: 'Item separado para um chamado voltou — repõe o estoque.' },
  retorno: { rotulo: 'Devolução', descricao: 'Item que estava com a pessoa voltou para a prateleira — repõe o estoque.' },
  ajuste: { rotulo: 'Ajuste', descricao: 'Correção de inventário (± com justificativa).' },
}

export function rotuloTipoLancamento(t: TipoLancamento): string {
  return TIPO_LANCAMENTO_META[t]?.rotulo ?? t
}

export function descricaoTipoLancamento(t: TipoLancamento): string {
  return TIPO_LANCAMENTO_META[t]?.descricao ?? ''
}

// Pílula colorida da coluna Tipo no histórico. A F41 alinhou a TINTA ao rótulo: se
// o item passou a dizer "Compra" e "Devolução" com as palavras do ativo, dizê-las
// em cores diferentes das do ativo desfaria metade do trabalho — o operador
// reconhece o selo antes de ler a palavra.
//
// Cada tipo usa EXATAMENTE o token do tipo correspondente do ativo (`TIPO_PILL`):
//   entrada  → a de `compra`      (era `selo-em-uso`; virou `selo-em-estoque`)
//   saida    → a de `saida`       (já casava)
//   retorno  → a de `devolucao`   (era `selo-troca`; virou `selo-em-uso`)
//   ajuste   → a neutra           (já casava — no ativo, `ajuste` também é neutra)
// O par reserva/liberacao não tem correspondente com tinta própria no ativo (lá
// `reserva` cai na neutra), então mantém a sua: são de histórico, e distingui-los
// do resto ajuda quem abre um lançamento antigo.
const TIPO_LANC_PILL: Record<TipoLancamento, string> = {
  entrada: 'bg-selo-em-estoque text-selo-em-estoque-texto',
  saida: 'bg-selo-em-manutencao text-selo-em-manutencao-texto',
  reserva: 'bg-selo-reservado text-selo-reservado-texto',
  liberacao: 'bg-selo-troca text-selo-troca-texto',
  retorno: 'bg-selo-em-uso text-selo-em-uso-texto',
  // F19 — mesmo neutro AA do `pillTipo` (ver PILL_NEUTRA).
  ajuste: PILL_NEUTRA,
}

export function pillTipoLancamento(t: TipoLancamento): string {
  return TIPO_LANC_PILL[t] ?? PILL_NEUTRA
}

// ---------- TERMO ----------
export const TERMO_META: Record<TermoStatus, { rotulo: string }> = {
  sim: { rotulo: 'Assinado' },
  enviado: { rotulo: 'Enviado (sem assinatura)' },
  // 'gerado' = documento emitido pelo sistema, ainda sem assinatura (F5A).
  // Continua contando como pendência (v_pendencias) — a cobrança não afrouxa.
  gerado: { rotulo: 'Gerado' },
  nao: { rotulo: 'Não gerado' },
}

export function rotuloTermo(t: TermoStatus | null | undefined): string {
  if (!t) return 'Não informado'
  return TERMO_META[t]?.rotulo ?? t
}

// Ordem de exibição dos status de termo no <Select> da nova movimentação (espelha
// STATUS_ORDEM). FONTE ÚNICA da lista de opções — antes os 4 valores estavam
// hard-coded no JSX (passo-movimentacao.tsx), soltos do enum. Um teste
// (dominio.test.ts) trava que esta lista é uma permutação exata de
// `Constants.public.Enums.termo_status`: se um valor entrar/sair do enum do banco,
// o teste quebra e o select não fica mudo.
export const TERMO_STATUS_ORDEM: TermoStatus[] = ['sim', 'enviado', 'gerado', 'nao']

// ---------- ITENS DA DEVOLUCAO ----------
// F39 — a lista fixa de acessorios da devolucao (a constante, o mapa de rotulos e
// a funcao de rotulo) SAIU daqui. Os nomes antigos estao em docs/DECISOES.md.
//
// O vocabulario do que acompanha um equipamento deixou de ser lista fixa do codigo
// e passou a ser o catalogo `tipos_item` (F37, migration 0114), que o administrador
// edita em Administracao -> Tipos de item. A F38 ja tinha tirado dele o governo do
// checklist; esta fase tirou o resto.
//
// ONDE PROCURAR AGORA:
//   · o rotulo de um slug   -> `rotuloTipoItem(slug, mapa)` em lib/itens/rotulo-tipo.ts
//     (modulo PURO, com o MESMO fallback pelo slug cru que a funcao antiga tinha);
//   · o catalogo            -> `listarTiposItem()` (TODOS, para quem exibe passado)
//     e `listarTiposItemAtivos()` (para quem oferece escolha), em queries/tipos-item.ts;
//   · os SETE slugs historicos (`carregador`, `mochila`, `mouse`, `teclado`,
//     `mousepad`, `fone`, `cabo`) continuam no seed da 0114, e continuam sendo os
//     literais que `movimentacoes.itens_faltantes` e `pendencias_item.item` guardam
//     em producao. Quem os protege agora e validators/tipos-item-sql.test.ts.
//
// SLUG GRAVADO NUNCA MUDA — isso nao mudou com a remocao. Rotulo pode.

// ---------- DESFECHO DA PENDÊNCIA DE ITEM (F18 §B5) ----------
// Uma pendência de item faltante (tabela pendencias_item) encerra por ação MANUAL
// com um destes desfechos. Fonte única do vocabulário De→Para: o validator Zod
// (src/lib/validators/pendencia-item.ts) importa DESFECHOS_PENDENCIA_ITEM daqui, e
// a UI/CSV usa os rótulos abaixo. 'recuperado' = o item voltou; 'baixa' = não vai
// voltar (a mochila de desligamento que a empresa não cobra formalmente).
export const DESFECHOS_PENDENCIA_ITEM = ['recuperado', 'baixa'] as const
export type DesfechoPendenciaItem = (typeof DESFECHOS_PENDENCIA_ITEM)[number]

export const DESFECHO_PENDENCIA_ITEM_ROTULO: Record<DesfechoPendenciaItem, string> = {
  recuperado: 'Item recuperado',
  baixa: 'Baixa — não vai voltar',
}

export function rotuloDesfechoPendenciaItem(desfecho: string | null | undefined): string {
  if (!desfecho) return ''
  return DESFECHO_PENDENCIA_ITEM_ROTULO[desfecho as DesfechoPendenciaItem] ?? desfecho
}

// ---------- MARCADOR DA CARGA ÚNICA DE GO-LIVE (F4 → filtro F6A-A1) ----------
// A carga inicial (scripts/import/plano.ts, papel 'compra_inicial') gravou, para
// cada ativo, uma COMPRA sintética de abertura com esta observação EXATA. Não é
// evento do período — as leituras do relatório a excluem
// (src/lib/queries/relatorios/movimentacoes.ts). É a FONTE ÚNICA do literal
// (plano.ts importa daqui): mudá-lo re-exibiria ~1.576 linhas de abertura no
// relatório de produção. Igualdade EXATA de propósito — o AJUSTE de reconciliação
// usa 'carga go-live: estado conforme planilha…' (prefixo homônimo); um filtro
// por LIKE varreria os ajustes também. Nunca usar LIKE 'carga go-live%'.
export const OBS_CARGA_GOLIVE = 'carga go-live'

// ---------- MARCADOR DA CARGA DE SALDOS INICIAIS DE ITENS (F6C, futura) ----------
// A carga de saldos de itens por quantidade (scripts/import/carga.ts) marcará cada
// LANÇAMENTO inicial com esta observação EXATA. Não é movimentação do período — as
// leituras do relatório de itens a excluem (src/lib/queries/relatorios/itens.ts),
// mesma lição do A1. Igualdade EXATA de propósito; nunca filtrar por LIKE. É a
// FONTE ÚNICA do literal (a carga da F6C importará daqui).
export const OBS_SALDO_INICIAL = 'saldo inicial (go-live)'

// ---------- MARCADOR DA CARGA DE STARTUP POR CSV (F7 — import "Substituir tudo") ----------
// O import de startup por filial (RPC importar_ativos_substituir) grava, por ativo,
// uma COMPRA de abertura e — quando o estado-alvo não é 'em_estoque' — um AJUSTE de
// reconciliação. Esta observação, prefixada pela data (`import startup dd/MM/yyyy`),
// ESCONDE a movimentação das tabelas/série do relatório (leitura por PREFIXO em
// src/lib/queries/relatorios/movimentacoes.ts — `not.like 'import startup*'`).
//
// F8 (migration 0036, decisão do Johnny 20/07/2026): a COMPRA de abertura volta a levar
// SEMPRE o marcador — com OU sem data real —, escondida do relatório do período; a data
// real segue na própria compra (histórico as-of / ficha do ativo). Reverte a F7H (0035),
// que deixava a compra COM data escapar do marcador e aparecer nas Entradas: a planilha
// de startup não distingue "compra nova" de "saldo de abertura" (toda linha tem data).
// Compra "de verdade" é a LANÇADA MANUALMENTE no sistema pós-go-live (sem marcador →
// aparece nas Entradas). O AJUSTE segue SEMPRE com o marcador. Ver ESPECIFICACAO §10.2
// (Emenda F8).
//
// Diferente do OBS_CARGA_GOLIVE (igualdade exata), aqui o filtro é por PREFIXO porque
// a observação carrega a data variável do import. É a FONTE ÚNICA do literal do
// PREFIXO — mantenha em sincronia com a string hard-coded nas migrations 0032→0036.
export const OBS_IMPORT_STARTUP = 'import startup'

// ---------- PENDÊNCIA DE PATRIMÔNIO NULO (F7E — import sem plaqueta) ----------
// Ativo importado sem patrimônio físico (`""`/`n/a`/"SEM PATRIMONIO"…) nasce com
// `ativos.pendencia` contendo ESTE trecho. É o MESMO literal que o go-live F4 já
// gravou (a fila de pendências fica uma só) e o MESMO que a RPC
// importar_ativos_substituir (migration 0034) hard-coda no insert — mantenha em
// SINCRONIA com aquele SQL (precedente OBS_IMPORT_STARTUP). A pendência é
// `;`-joinable (ex.: 'sem patrimônio físico; termo pendente'): ao corrigir o
// patrimônio na ficha, remove-se só ESTE trecho, preservando os demais.
export const PENDENCIA_SEM_PATRIMONIO = 'sem patrimônio físico'

// Irmã da anterior, gravada pelo go-live F4 quando o patrimônio veio fora do formato
// canônico (literal completo: 'patrimônio não canônico (importado como veio da
// planilha)'). É a FONTE ÚNICA do PREFIXO — e só o prefixo: o `.or()` do PostgREST
// parte vírgula como separador de condições e trata parênteses como agrupamento,
// então a parte "(importado…)" NUNCA entra num filtro. `%prefixo%` casa o completo.
// Vivia como const local de `queries/pendencias-detalhe.ts`; subiu para cá quando o
// bucket de patrimônio passou a ser contado também nos chips (`queries/relatorios/
// pendencias.ts`) — duas cópias do literal era o caminho para os dois lados da tela
// discordarem de novo.
export const PENDENCIA_PATRIMONIO_NAO_CANONICO = 'patrimônio não canônico'

// ---------- PENDÊNCIA DE SERVICE TAG NULA (F15 C1 — import/cadastro sem tag) ----------
// Irmã de PENDENCIA_SEM_PATRIMONIO. Ativo IMPORTADO sem service tag nasce com
// `ativos.pendencia` contendo ESTE trecho (o cadastro MANUAL passa a EXIGIR a tag —
// Zod+action —, então só o import a produz). MESMO literal que a RPC
// importar_ativos_substituir (migration 0048) hard-coda — mantenha em SINCRONIA com
// aquele SQL (precedente PENDENCIA_SEM_PATRIMONIO / 0034). A pendência é `;`-joinable
// (ex.: 'sem patrimônio físico; sem service tag'): ao definir a service tag na ficha,
// remove-se só ESTE trecho, preservando os demais.
export const PENDENCIA_SEM_SERVICE_TAG = 'sem service tag'

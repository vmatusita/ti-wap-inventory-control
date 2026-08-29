// F25 — as DECISÕES de `prepararTermo`, isoladas como funções puras.
//
// POR QUE AQUI E NÃO DENTRO DA ACTION: `prepararTermo` é uma Server Action que
// depende de sessão, cargo e banco — em teste ela exigiria tudo isso, e por isso
// ninguém escreveria os casos de borda que importam (lote de filiais divergentes,
// filial sem cidade cadastrada, termo antigo cujo snapshot não tem a chave nova).
// É a mesma razão pela qual `validarTrocaDePapel` mora em `validators/admin.ts` e
// não na action de usuários.
//
// A action continua sendo o único lugar que LÊ o banco; ela só delega o julgamento.

import type { CategoriaAtivo } from '@/lib/dominio'
import type { CamposTermo } from '@/lib/validators/termo'
import { checklistPodeLancar } from '@/components/movimentacoes/nova/itens-do-lote'

export type FilialDoTermo = { id: number; nome: string; cidade: string }

export type AtivoDoTermo = {
  categoria: CategoriaAtivo
  marca: string | null
  modelo: string | null
  service_tag: string | null
  patrimonio: string | null
  telefone: string | null
  imei: string | null
  pulsus: string | null
  filial_id: number
}

/**
 * A cidade que vai na linha da assinatura, mais os avisos que o operador precisa
 * ler ANTES de gerar.
 *
 * Regras (F25 §3.2):
 *  · a cidade sai da filial do PRIMEIRO ativo do lote;
 *  · lote com filiais divergentes avisa — o termo é um documento único, e alguém
 *    tem de conferir qual cidade vale (mesmo padrão do aviso de "vários donos");
 *  · filial sem cidade cadastrada avisa, em vez de deixar sair um documento que
 *    começa por vírgula (o `nullGetter` do docxtemplater rende '' em silêncio).
 */
export function cidadeDoTermo(
  ativos: readonly { filial_id: number }[],
  filiais: ReadonlyMap<number, FilialDoTermo>,
): { cidade: string; avisos: string[] } {
  const avisos: string[] = []
  if (ativos.length === 0) return { cidade: '', avisos }

  const primeira = filiais.get(ativos[0].filial_id)
  const cidade = primeira?.cidade ?? ''
  const idsDoLote = [...new Set(ativos.map((a) => a.filial_id))]

  if (idsDoLote.length > 1) {
    const nomes = idsDoLote.map((id) => filiais.get(id)?.nome ?? `#${id}`)
    avisos.push(
      `Este lote tem equipamentos de mais de uma filial (${nomes.join(', ')}). ` +
        `A cidade da assinatura veio de ${primeira?.nome ?? 'a primeira'} — confira antes de gerar.`,
    )
  }
  // ⚠ `if` SEPARADO, e não `else if`: os dois avisos podem valer ao mesmo tempo, e o
  // caso combinado é justamente o pior — lote misto cuja PRIMEIRA filial não tem
  // cidade cadastrada. Com `else if`, o aviso do lote engolia o da cidade vazia e o
  // documento sairia começando por vírgula sem ninguém dizer por quê.
  if (!cidade) {
    avisos.push(
      `A filial ${primeira?.nome ?? 'do ativo'} não tem cidade cadastrada — ` +
        `cadastre em Administração → Filiais ou preencha aqui.`,
    )
  }

  return { cidade, avisos }
}

/**
 * O que falta no cadastro do ativo para o termo sair completo.
 *
 * ⚠ SÓ os campos cadastrais de hardware. Telefone, IMEI e Pulsus ficaram DE FORA
 * de propósito, apesar de a F25 tê-los trazido para o ativo:
 *
 *  · a migration 0101 não faz backfill (decisão registrada — mover texto livre de
 *    `observacoes` é trabalho humano), então a frota inteira de celulares
 *    cadastrada antes de 04/08/2026 tem os três nulos. O aviso dispararia em ~100%
 *    dos termos de celular, e aviso que sempre aparece é aviso que ninguém lê — o
 *    banner é o mesmo que carrega os avisos que importam (lote de filiais
 *    divergentes, filial sem cidade cadastrada);
 *  · e o aviso descreveria como ANOMALIA o fluxo normal deles: telefone, IMEI e
 *    Pulsus foram MANUAIS por decisão explícita da F5A (PLANO-TERMOS §3.6) e são
 *    digitados no diálogo desde então. Marca, modelo, service tag e patrimônio
 *    também são editáveis ali, mas para eles o vazio é um buraco no CADASTRO — algo
 *    a consertar na ficha. Para os três do celular, até a 0101, cadastro não havia.
 *
 * O pré-preenchimento pelo cadastro (o ganho real da fase) continua igual; quem
 * não tiver o IMEI no ativo simplesmente digita, como sempre fez.
 *
 * ⚠ Isto REVOGA o §2.3 da ordem F25 ("o aviso passa a cobrir os 3 quando a categoria
 * é celular"). Ata em docs/DECISOES.md (04/08/2026).
 */
export function camposFaltantesDoTermo(a: AtivoDoTermo): string[] {
  return [
    !a.marca && 'marca',
    !a.modelo && 'modelo',
    !a.service_tag && 'service tag',
    !a.patrimonio && 'patrimônio',
  ].filter(Boolean) as string[]
}

/**
 * Os campos com que o diálogo REABRE um termo já salvo.
 *
 * O snapshot manda — ele é o que foi para o papel —, mas só nas chaves que ele
 * tem. Todo termo gerado ANTES da F25 não tem `cidade` no jsonb, e sem esta
 * mescla o campo abriria vazio e o documento sairia começando por vírgula.
 *
 * Chave presente-mas-vazia no snapshot continua vencendo: ela é uma edição
 * deliberada de quem gerou, não uma ausência.
 */
export function mesclarCamposSalvos(
  preparados: CamposTermo,
  salvos: CamposTermo,
): CamposTermo {
  return { ...preparados, ...salvos }
}

// ---------------------------------------------------------------------------
// F39 · §C.3 — o aviso do que o papel esconderia
// ---------------------------------------------------------------------------

/** Uma movimentação do lote, do ponto de vista de "quem detinha e onde". */
export type MovimentacaoParaAviso = {
  filial_id: number
  /**
   * Quem detinha o equipamento ANTES da devolução. Vem do `snapshot_anterior` —
   * `ativos.colaborador_atual` já foi limpo pelo trigger quando o termo é
   * preparado, e ler dali diria "ninguém" para o lote inteiro.
   */
  detentor_anterior: string | null
}

export const MSG_CONFERENCIA_SEM_LANCAMENTO =
  'Houve item conferido nesta devolução que não gerou lançamento de estoque — ' +
  'confira a linha de componentes antes de gerar.'

/**
 * O aviso do caso que o papel esconderia: o operador conferiu "Voltou" e
 * `{outros_componentes}` sai VAZIO, afirmando num documento assinado que nada
 * acompanhou.
 *
 * A FONTE DO "VOLTOU" É O LANÇAMENTO, e não existe registro do que foi marcado e
 * não lançou — então o aviso é derivado do que dá para saber no servidor. O que dá
 * para saber é o **lote misto**: a mesma condição que desliga o lançamento do
 * checklist em `checklistPodeLancar` (F38), reusada aqui de propósito, para que as
 * duas pontas não possam divergir.
 *
 * ⚠ O ESPELHO RETROSPECTIVO. Na tela, `checklistPodeLancar` olhou o `colaborador_atual`
 * do ativo; aqui ele já foi limpo pelo trigger da devolução, e o equivalente é o
 * `snapshot_anterior.colaborador`. A filial não muda numa devolução, então a
 * corrente serve.
 *
 * ⚠ O QUE ESTE AVISO **NÃO** COBRE, e vai declarado no relatório: tipo cuja ponte
 * não resolve item de catálogo (`ponte-tipo-item.ts` — zero candidatos, ou
 * ambiguidade que ninguém decidiu) também não gera lançamento, e disso não fica
 * registro nenhum no banco. Num lote homogêneo esse caso é indistinguível de "nada
 * acompanhou mesmo".
 *
 * ⚠ POR QUE `itens_faltantes` NÃO DISPARA O AVISO SOZINHO: o que faltou já sai na
 * `{observacao}` ("Não devolvido(s): …"), que é o caminho honesto e o mais comum.
 * Avisar ali faria o banner aparecer em quase toda devolução — e aviso que sempre
 * aparece é aviso que ninguém lê, pela mesma razão já registrada em
 * `camposFaltantesDoTermo`.
 */
export function avisoConferenciaSemLancamento(
  movs: readonly MovimentacaoParaAviso[],
  linhaDeComponentes: string,
): string | null {
  if (linhaDeComponentes.trim() !== '') return null
  const lote = movs.map((m) => ({
    filial_id: m.filial_id,
    colaborador_atual: m.detentor_anterior,
  }))
  return checklistPodeLancar(lote) ? null : MSG_CONFERENCIA_SEM_LANCAMENTO
}

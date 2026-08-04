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
 * ⚠ Os três campos de celular só entram quando a categoria É celular: sem essa
 * guarda, todo termo de notebook passaria a avisar que falta IMEI.
 */
export function camposFaltantesDoTermo(a: AtivoDoTermo): string[] {
  const ehCelular = a.categoria === 'celular'
  return [
    !a.marca && 'marca',
    !a.modelo && 'modelo',
    !a.service_tag && 'service tag',
    !a.patrimonio && 'patrimônio',
    ehCelular && !a.telefone && 'nº do telefone',
    ehCelular && !a.imei && 'IMEI',
    ehCelular && !a.pulsus && 'Pulsus',
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

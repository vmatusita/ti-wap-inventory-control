// F32/RV-14 — "Saídas" ou "Saídas · 19"? A análise (§2) mediu que o leitor só
// decide "vale rolar até lá" DEPOIS do gesto, porque o rótulo sozinho não diz
// quanto tem na seção — e o snapshot já carrega toda contagem que o chip
// precisa, sem nova consulta. Esta função isola a REGRA (que chip aparece, com
// que número) do componente React que a usa (`chips-ancora.tsx`), porque a
// regra tem ramo condicional por chip e vale testar sem montar DOM/observer.
export type ContagensAncora = {
  acessorios?: number
  componentes?: number
  saidas: number
  entradas: number
  transferencias: number
  movItens: number
  temObservacao?: boolean
}

export type ChipAncora = {
  href: string
  rotulo: string
  /** Ausente = chip estrutural (Principais/Resumo/Observações/Como ler): não
   *  tem contagem que signifique algo, então não leva número. */
  numero?: number
}

// Acessórios/Componentes/Saídas/Entradas SEMPRE aparecem — é o `BASE` fixo que
// já existia antes da F32 (o relatório sempre tem as quatro seções, mesmo que
// uma tabela venha vazia no período). `acessorios`/`componentes` chegam
// opcionais porque o chamador deriva de `Array.find` (`| undefined` no tipo),
// mas o chip mostra `0`, nunca some — a ausência de dado não é a mesma coisa
// que a seção não existir.
//
// Transferências e Itens só aparecem com linha (`> 0`) e Observações só com
// texto gravado — a MESMA regra condicional que já existia no `chips-ancora.tsx`
// de antes da F32 (lá era `temTransferencias`/`temMovItens`/`temObservacao`
// calculados no chamador; aqui nasce direto da contagem, então preservar o
// comportamento é só trocar `> 0` boolean por comparação numérica).
export function montarChipsAncora(contagens: ContagensAncora): ChipAncora[] {
  const chips: ChipAncora[] = [{ href: '#principais', rotulo: 'Principais' }]
  chips.push({ href: '#acessorios', rotulo: 'Acessórios', numero: contagens.acessorios ?? 0 })
  chips.push({ href: '#componentes', rotulo: 'Componentes', numero: contagens.componentes ?? 0 })
  chips.push({ href: '#saidas', rotulo: 'Saídas', numero: contagens.saidas })
  chips.push({ href: '#entradas', rotulo: 'Entradas', numero: contagens.entradas })
  if (contagens.transferencias > 0) {
    chips.push({ href: '#transferencias', rotulo: 'Transferências', numero: contagens.transferencias })
  }
  if (contagens.movItens > 0) {
    chips.push({ href: '#mov-itens', rotulo: 'Itens', numero: contagens.movItens })
  }
  // F29/REL-09a — "Resumo do período" fecha o corpo (é o texto que vai para o
  // e-mail); o chip vem depois das tabelas e antes de "Como ler".
  chips.push({ href: '#resumo', rotulo: 'Resumo' })
  if (contagens.temObservacao) chips.push({ href: '#observacao', rotulo: 'Observações' })
  // F17/B4 — âncora do glossário, sempre presente no corpo v2 (único que
  // renderiza estes chips). Fragmento na MESMA página → seguro para o
  // visualizador por senha (nenhum href para fora de /relatorios).
  chips.push({ href: '#como-ler', rotulo: 'Como ler' })
  return chips
}

import type { CampoEditavel, CorrecaoImport } from '@/lib/import'

// Rótulos pt-BR da correção de erros do import (OS-F7B / W3). Só apresentação —
// a régua é o motor (`src/lib/import/`). Compartilhado por `grupos-erros.tsx` e
// `correcoes-aplicadas.tsx`.
//
// Importa só TIPOS do barrel `@/lib/import` (apagados no build): o barrel puxa
// `plano.ts` → node:crypto e não pode entrar no bundle do cliente.

/** Campo corrigível → nome da coluna como ela aparece no CSV do inventário. */
export const ROTULO_CAMPO: Record<CampoEditavel, string> = {
  site: 'Site',
  tipo: 'Tipo',
  patrimonio: 'Patrimônio',
  serviceTag: 'Service Tag',
  situacao: 'Situação',
  colaborador: 'Colaborador',
  dataInclusao: 'Data de Inclusão',
  dataEntrega: 'Data de Entrega',
}

/** `ErroImport.tipo` (motor W1) → rótulo curto do badge do card. Tipo novo que
 *  não estiver aqui cai no próprio identificador (nunca some da tela). */
const ROTULO_TIPO_ERRO: Record<string, string> = {
  site_divergente: 'Site',
  categoria_desconhecida: 'Tipo',
  patrimonio_invalido: 'Patrimônio',
  patrimonio_vazio: 'Sem patrimônio', // F7E — aviso: importa sem patrimônio (pendência)
  estado_desconhecido: 'Situação',
  estado_descartado: 'Descartado',
  par_duplicado: 'Duplicata',
  patrimonio_duplicado_sem_service_tag: 'Duplicata',
  patrimonio_em_outra_filial: 'Já existe em outra filial',
  sem_data_entrada: 'Sem data',
  estado_em_uso_sem_colaborador: 'Sem colaborador',
  linha_sem_chave: 'Linha sem chave',
  header_invalido: 'Cabeçalho',
  correcao_invalida: 'Correção inválida',
  plano_vazio: 'Plano vazio',
}

export function rotuloTipoErro(tipo: string): string {
  return ROTULO_TIPO_ERRO[tipo] ?? tipo
}

export const VAZIO = '(vazio)'

function comAspas(valor: string): string {
  return valor.trim() === '' ? VAZIO : `"${valor}"`
}

/** Descrição legível de uma correção — o painel "Correções aplicadas". */
export function descreverCorrecao(op: CorrecaoImport): string {
  switch (op.op) {
    case 'substituir':
      return `${ROTULO_CAMPO[op.campo]}: ${comAspas(op.de)} → ${comAspas(op.para)} (todas as linhas)`
    case 'substituir_estado':
      return `Situação: Status=${comAspas(op.statusDe)} · Situação=${comAspas(op.situacaoDe)} → ${comAspas(op.para)}`
    case 'editar':
      return `Linha ${op.linha} · ${ROTULO_CAMPO[op.campo]} → ${comAspas(op.para)}`
    case 'remover_linha':
      return `Remover a linha ${op.linha}`
    case 'forcar_patrimonio':
      return `Linha ${op.linha} · usar patrimônio fora do padrão`
  }
}

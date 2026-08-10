import type { KpisRelatorio } from '@/lib/relatorios/tipos'

// Destinos dos KPI tiles do relatório AO VIVO (F16/T4). Puro e testado.
//
// Espelha o `LINKS_KPI` do dashboard (app/(app)/page.tsx): os valores de `status`
// são os do enum `status_ativo`, que é o que /ativos aceita em `?status=` (CSV). O
// tile "Total de ativos" lista os 7 status que o KPI soma (`kpisDeEstado` pula as
// baixas `descartado`/`devolvido_fornecedor`) — apontar para /ativos sem filtro
// mostraria um número maior que o do tile. Acrescenta `emprestado` (o dashboard não
// tem esse tile; o GrupoKpis do relatório tem) e, quando o relatório é de UMA filial,
// o `&filial=<id numérico>` (o filtro de /ativos é por ID, não pelo slug do relatório).
//
// Só o AO VIVO passa estes links (o snapshot congelado aponta para o inventário de
// HOJE, que não é o do período congelado — enganoso; e o viewer por senha não pode
// sair de /relatorios/**). O corte de verdade é na página (não monta `links` p/ viewer
// nem p/ snapshot).

export type LinksKpi = Partial<Record<keyof KpisRelatorio, string>>

// Os 7 status que o KPI "total" soma (mesma lista do dashboard) — exclui as baixas.
const STATUS_TOTAL = 'em_estoque,reservado,em_uso,emprestado,em_triagem,em_manutencao,defasado'

// F25 — o `filial=todas` do ramo CONSOLIDADO não é enfeite. Sem ele, o link vai
// para /ativos SEM o param, e a ausência do param passou a significar "o padrão do
// CARGO": um operador clicaria num tile que soma TODAS as filiais e cairia numa
// lista recortada nas filiais dele — o número da tela deixaria de bater com o do
// tile que ele acabou de clicar. A sentinela declara explicitamente o que o tile
// promete.
//
// F32/RV-12 — extraído de dentro de `linksKpiAtivos` para virar o `recorteFilial`
// que `urlAtivosPorSegmento` (cliques-grafico.ts) também precisa: o clique num
// segmento das barras empilhadas monta a MESMA sentinela, e duplicá-la ali seria
// o jeito de as duas um dia divergirem (uma corrigida, a outra esquecida — a
// família de achados que `url-params.ts` documenta). `linksKpiAtivos` não mudou
// de comportamento: só passou a chamar esta função em vez de montar o literal
// inline (prova: os testes existentes de `kpi-links.test.ts` continuam passando
// sem edição).
export function recorteFilialAtivos(filialId: number | null): string {
  return filialId != null ? `&filial=${filialId}` : '&filial=todas'
}

export function linksKpiAtivos(filialId: number | null): LinksKpi {
  const filial = recorteFilialAtivos(filialId)
  return {
    total: `/ativos?status=${STATUS_TOTAL}${filial}`,
    em_uso: `/ativos?status=em_uso${filial}`,
    em_estoque: `/ativos?status=em_estoque${filial}`,
    reservado: `/ativos?status=reservado${filial}`,
    em_triagem: `/ativos?status=em_triagem${filial}`,
    em_manutencao: `/ativos?status=em_manutencao${filial}`,
    defasado: `/ativos?status=defasado${filial}`,
    emprestado: `/ativos?status=emprestado${filial}`,
  }
}

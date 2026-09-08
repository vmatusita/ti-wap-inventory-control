import 'server-only'
// Barrel público da camada de dados dos relatórios (OS-F3 3.6). O que era o
// god-file queries/relatorios.ts virou módulos coesos por responsabilidade
// (comum · estoque · movimentacoes · pendencias · itens · snapshot); este barrel
// mantém a API pública ESTÁVEL — `@/lib/queries/relatorios` continua exportando
// exatamente os mesmos nomes de antes, então nenhum consumidor mudou.
//
// TODAS as funções recebem o client já resolvido (RLS do operador OU client
// administrativo p/ sessão por senha — lib/auth/acesso.ts) e são parametrizadas
// por filial e período. `filialId null` = consolidado (geral). O motor v1 (grade
// da F3) foi removido na Fase 3.5: o relatório ao vivo, a geração de snapshot e o
// dashboard consomem uma única implementação por agregação, sobre o estado
// reconstruído (`lerEstadoAtivos`). Ver docs/DECISOES.md.

export type { DbClient, Filial } from './comum'
export { resolverFilialPorSlug } from './comum'
export { getKpis } from './estoque'
export {
  getPorMotivo,
  getResumoPeriodo,
  getSerieMovimentacoes,
  getUltimasMovimentacoes,
} from './movimentacoes'
export { getPendencias } from './pendencias'
export { getSnapshotRelatorioV2 } from './snapshot'

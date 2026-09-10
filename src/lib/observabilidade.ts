import 'server-only'

// A PORTA DO FUNIL DE FALHA DO SERVIDOR (F55 · Frente A).
//
// É este o módulo que o aplicativo importa:
//
//     import { registrarFalha } from '@/lib/observabilidade'
//     ...
//     } catch (erro) {
//       registrarFalha({ escopo: 'import.backup-acervo', erro, ctx: { filial } })
//       return { ok: false, erro: 'Não consegui gravar o backup. Nada foi apagado.' }
//     }
//
// O `import 'server-only'` acima é a promessa da ficha: nenhum Client Component
// alcança o funil. Toda a lógica — a redação por nome e por valor, o formato da
// linha, a garantia de nunca lançar — mora em `observabilidade-linha.ts`, que
// NÃO carrega `server-only` e por isso pode ser provado por sabotagem no Vitest.
// O motivo da separação está escrito no cabeçalho de lá.
export {
  registrarFalha,
  linhaDeFalha,
  erroEstruturado,
  redigirTexto,
  sanearContexto,
} from '@/lib/observabilidade-linha'

export type {
  ContextoFalha,
  EntradaFalha,
  ErroEstruturado,
} from '@/lib/observabilidade-linha'

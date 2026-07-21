// Escada de precedência do patrimônio no import de startup — NÚCLEO onde as iterações
// F7* colidem (F7E/F7F/F7-pós/F7J). Extraído de `montarPlanoImport` (plano.ts) para um
// módulo PURO e isolado, coberto por testes de tabela próprios (resolver-patrimonio.test.ts).
// Sem banco/UI/crypto — folha pura, testável direto.
//
// Prioridade (decisão do Johnny 20/07/2026), na ordem dos ramos:
//   (1) valor da CÉLULA que canonicaliza → usa (NUNCA sobrescrito pelo hostname);
//   (2) linha FORÇADA (`forcar_patrimonio`, F7J) fora de formato → aceita o CRU como
//       patrimônio não-canônico ("usar mesmo assim"; vence o hostname), DESDE que
//       ≤ 60 caracteres — a MESMA sanidade da RPC (migration 0037). Longo demais →
//       BLOQUEANTE (a RPC recusaria; o preview tem de capturar tudo que ela recusa);
//   (3) patrimônio embutido no HOSTNAME (prefixo conhecido + dígitos) → substitui
//       AUTOMÁTICO (silencioso, `patrimonio_do_hostname`), para célula vazia/que declara
//       ausência E para FORA DE FORMATO (revoga a invariante F7F);
//   (4) célula que DECLARA ausência (`eraVazio`) → NULO + pendência "sem patrimônio
//       físico" (aviso `patrimonio_vazio`);
//   (5) fora de formato, SEM hostname, NÃO forçado → BLOQUEANTE `patrimonio_invalido`.
//
// As mensagens de aviso/bloqueante são IDÊNTICAS às que `montarPlanoImport` emitia (byte a
// byte); o chamador só anexa `linha`/`coluna: 'Patrimônio'`/`valor: <cru>`.

import { canonicalizarPatrimonio } from '@/lib/patrimonio'
import { extrairPatrimonioDoHostname } from './deparas'

export type ResolucaoPatrimonio =
  | {
      patrimonio: string | null
      aviso?: { tipo: 'patrimonio_do_hostname' | 'patrimonio_vazio'; mensagem: string }
    }
  | { bloqueante: { tipo: 'patrimonio_invalido'; mensagem: string } }

/**
 * @param cru       valor bruto da célula de patrimônio (como veio no CSV).
 * @param eraVazio  `patrimonioVazio(cru)` — computado pelo chamador (que também o usa
 *                  para decidir o `patrimonio_original`), passado aqui para não recomputar.
 * @param hostname  o hostname cru da linha (fonte do patrimônio embutido).
 * @param forcado   a linha está em `forcar_patrimonio` (op F7J)?
 */
export function resolverPatrimonio(
  cru: string,
  eraVazio: boolean,
  hostname: string | null,
  forcado: boolean,
): ResolucaoPatrimonio {
  // (1) célula canônica vence tudo.
  const canon = eraVazio ? null : canonicalizarPatrimonio(cru)
  if (canon) return { patrimonio: canon }

  // (2) forçado: aceita o cru não-canônico com a sanidade ≤ 60 da RPC.
  if (!eraVazio && forcado) {
    const t = cru.trim()
    if (t.length > 60) {
      return {
        bloqueante: {
          tipo: 'patrimonio_invalido',
          mensagem: `Patrimônio longo demais para forçar (${t.length} caracteres; máximo 60).`,
        },
      }
    }
    return { patrimonio: t }
  }

  // (3) hostname com patrimônio embutido → auto-preenche (aviso informativo).
  const doHostname = extrairPatrimonioDoHostname(hostname)
  if (doHostname) {
    return {
      patrimonio: doHostname,
      aviso: {
        tipo: 'patrimonio_do_hostname',
        mensagem: eraVazio
          ? `patrimônio ausente — preenchido automaticamente pelo hostname (${doHostname})`
          : `patrimônio "${cru.trim()}" fora do formato — substituído automaticamente pelo hostname (${doHostname})`,
      },
    }
  }

  // (4) declara ausência → importa nulo com pendência.
  if (eraVazio) {
    return {
      patrimonio: null,
      aviso: {
        tipo: 'patrimonio_vazio',
        mensagem:
          'sem patrimônio — importa com pendência "sem patrimônio físico"; preencha na tela se souber o número',
      },
    }
  }

  // (5) fora de formato, sem hostname, não forçado → bloqueante.
  return {
    bloqueante: {
      tipo: 'patrimonio_invalido',
      mensagem: `Patrimônio "${cru}" fora do formato canônico (ex.: WAP0004491) e sem hostname aproveitável`,
    },
  }
}

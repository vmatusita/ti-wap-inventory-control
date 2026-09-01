'use client'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { GRUPOS_ESCOLHA, PERGUNTA_ESCOLHA, type GrupoEscolha } from '@/lib/itens/escolha-tipo'
import {
  TIPO_LANCAMENTO_META,
  descricaoTipoLancamento,
  pillTipoLancamento,
  type TipoLancamento,
} from '@/lib/dominio'
import { cn } from '@/lib/utils'

// A ESCOLHA DO TIPO DO LANÇAMENTO — os quatro botões, e nada mais (F42 · frente C).
//
// A HISTÓRIA EM DUAS LINHAS: em 19/08/2026 uma correção avulsa trocou o select de
// seis nomes por DUAS perguntas de operador (`lib/itens/escolha-tipo.ts`), porque
// o feedback do Johnny foi "está confuso o controle de itens". A F41 matou a
// SEGUNDA pergunta ao tirar o par reserva/liberação da tela: sem ele, "saiu da
// prateleira" tem uma resposta só. Sobraram quatro botões — Compra · Saída ·
// Devolução · Ajuste —, que são as palavras do ativo.
//
// ⚠ O JSX DA SEGUNDA PERGUNTA CONTINUAVA NO ARQUIVO até esta fase: `grupoDuplo`
// era sempre `null` (nenhum grupo tem mais de um tipo oferecido) e o bloco inteiro
// — 26 linhas, com um `px-2.5` e um `text-[11px]` fora da escala — era inatingível
// pela UI. Ele saiu aqui. Código morto que passa no lint é o que mais engana a
// próxima pessoa: ela lê, acredita, e planeja em cima.
//
// O RÓTULO OFICIAL CONTINUA À VISTA na pílula de confirmação — é a ponte com o
// histórico e o relatório, que guardam o valor do enum para sempre.

export function EscolhaTipoLancamento({
  tipo,
  grupoAtual,
  erro,
  desabilitado,
  dica,
  onEscolherGrupo,
}: {
  /** O tipo já escolhido, ou `null` enquanto a pergunta não foi respondida. */
  tipo: TipoLancamento | null
  /** O grupo correspondente — derivado do tipo pelo chamador. */
  grupoAtual: GrupoEscolha | null
  /** A cobrança do `salvar()` quando ninguém respondeu (`MSG_ESCOLHA_TIPO`). */
  erro: string | null
  desabilitado: boolean
  /** A dica do Ajuste ("para contar a prateleira inteira, use a Conferência"). */
  dica?: string | null
  onEscolherGrupo: (grupo: GrupoEscolha) => void
}) {
  return (
    <div className="space-y-2">
      <Label>{PERGUNTA_ESCOLHA}</Label>
      <div
        role="group"
        aria-label={PERGUNTA_ESCOLHA}
        className="grid grid-cols-2 gap-1.5 sm:grid-cols-4"
      >
        {GRUPOS_ESCOLHA.map((g) => (
          <Button
            key={g.chave}
            type="button"
            size="sm"
            variant={grupoAtual === g.chave ? 'default' : 'outline'}
            aria-pressed={grupoAtual === g.chave}
            className="min-h-10 px-2 sm:min-h-8"
            onClick={() => onEscolherGrupo(g.chave)}
            disabled={desabilitado}
          >
            {g.rotulo}
          </Button>
        ))}
      </div>
      {tipo ? (
        <p className="text-xs text-muted-foreground">
          {/* F42 — `text-[11px]` virou `text-xs` (12px, o degrau da escala). A
              pílula continua com a MESMA tinta do tipo correspondente do ativo,
              que é o que a F41 alinhou. */}
          <span
            className={cn(
              'mr-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-semibold',
              pillTipoLancamento(tipo),
            )}
          >
            {TIPO_LANCAMENTO_META[tipo].rotulo}
          </span>
          {descricaoTipoLancamento(tipo)}
        </p>
      ) : (
        erro && (
          <p role="alert" className="text-xs text-red-600 dark:text-red-400">
            {erro}.
          </p>
        )
      )}
      {dica && <p className="text-xs text-muted-foreground">{dica}</p>}
    </div>
  )
}

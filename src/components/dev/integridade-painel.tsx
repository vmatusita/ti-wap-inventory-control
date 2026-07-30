'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, ShieldAlert, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { rodarChecagensIntegridade } from '@/lib/actions/dev'
import type { Checagem } from '@/lib/queries/dev'

// Bloco "Integridade" da /dev (F22). Client Component porque o disparo é do usuário: as
// checagens NÃO rodam sozinhas ao abrir a página — são varreduras no banco inteiro e não
// podem virar custo fixo de toda visita.
//
// ⚠ O tipo `Checagem` entra por `import type`, que o compilador APAGA: `@/lib/queries/dev` é
// `server-only` e um import de valor aqui derrubaria o bundle do cliente. Mesmo padrão do
// `AtivoResumo` na paleta de comandos.
//
// ⚠ TUDO AQUI É SÓ LEITURA. A RPC `dev_checagens_integridade()` (migration 0077) só faz
// SELECT — não existe "corrigir automaticamente", e é deliberado: uma correção em massa
// disparada por um botão de diagnóstico é como se apagam dados sem querer. O que a tela
// entrega é a contagem e uma amostra para investigar à mão.

/** Quantos identificadores a amostra mostra por checagem (o resto fica no banco). */
const MAX_AMOSTRA = 5

function LinhaChecagem({ c }: { c: Checagem }) {
  const ok = c.erro === null && c.achados === 0
  const achou = c.erro === null && c.achados !== null && c.achados > 0

  return (
    <li className="rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{c.nome}</p>
          <p className="text-xs text-muted-foreground">{c.descricao}</p>
        </div>

        {ok && (
          <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-green-700 dark:text-green-400">
            <CheckCircle2 className="size-4" aria-hidden />
            ok
          </span>
        )}
        {achou && (
          <span className="flex shrink-0 items-center gap-1 text-sm font-medium tabular-nums text-amber-700 dark:text-amber-400">
            <TriangleAlert className="size-4" aria-hidden />
            {c.achados?.toLocaleString('pt-BR')}{' '}
            {c.achados === 1 ? 'achado' : 'achados'}
          </span>
        )}
        {c.erro !== null && (
          <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-amber-700 dark:text-amber-400">
            <ShieldAlert className="size-4" aria-hidden />
            não executada
          </span>
        )}
      </div>

      {/* A amostra é o que torna o número acionável: sem ela, "3 achados" manda o dev
          reescrever a consulta à mão para descobrir QUAIS são. */}
      {achou && c.amostra.length > 0 && (
        <ul className="mt-2 space-y-0.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {c.amostra.slice(0, MAX_AMOSTRA).map((a) => (
            <li key={a} className="truncate font-mono" title={a}>
              {a}
            </li>
          ))}
          {c.achados !== null && c.achados > c.amostra.length && (
            <li className="text-amber-800/80 dark:text-amber-200/70">
              …e mais {(c.achados - c.amostra.length).toLocaleString('pt-BR')} não
              mostrado(s).
            </li>
          )}
        </ul>
      )}

      {c.erro !== null && (
        <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {c.erro}
        </p>
      )}
    </li>
  )
}

export function IntegridadePainel({
  catalogo,
}: {
  /** Nome e descrição de cada checagem, para a tela dizer o que VAI conferir antes de rodar. */
  catalogo: readonly { chave: string; nome: string; descricao: string }[]
}) {
  const total = catalogo.length
  const [pending, start] = useTransition()
  const [checagens, setChecagens] = useState<Checagem[] | null>(null)

  function rodar() {
    start(async () => {
      try {
        const res = await rodarChecagensIntegridade()
        if (!res.ok) {
          toast.error(res.erro, { duration: 10000 })
          return
        }
        setChecagens(res.checagens)
        const comAchado = res.checagens.filter(
          (c) => c.erro === null && c.achados !== null && c.achados > 0,
        ).length
        const naoExecutadas = res.checagens.filter((c) => c.erro !== null).length
        if (naoExecutadas > 0) {
          toast.warning(
            `${naoExecutadas} checagem(ns) não pôde(puderam) ser executada(s) — veja o detalhe abaixo.`,
            { duration: 12000 },
          )
        } else if (comAchado > 0) {
          toast.warning(`${comAchado} checagem(ns) com achados.`, { duration: 12000 })
        } else {
          toast.success('Nenhum achado: as checagens passaram todas.')
        }
      } catch {
        // A mensagem diz que NADA foi alterado — as checagens são só leitura, e ninguém
        // precisa "desfazer" nada por causa de uma falha de rede.
        toast.error(
          'Não foi possível rodar as checagens. Nada foi alterado no banco — verifique a conexão e tente de novo.',
        )
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-prose text-sm text-muted-foreground">
          São <span className="tabular-nums">{total}</span> checagens que varrem o banco
          atrás de estados que não deveriam existir (cadastro em duplicidade, ativo em filial
          desativada, termo sem arquivo, conta sem perfil, entre outras). Num banco saudável
          <strong> todas devolvem zero</strong> — um número diferente de zero é o que merece
          investigação.
        </p>
        <Button type="button" onClick={rodar} disabled={pending} className="shrink-0">
          {pending ? 'Rodando…' : 'Rodar checagens'}
        </Button>
      </div>

      <p className="rounded-md border border-dashed p-2.5 text-xs text-muted-foreground">
        Nenhuma checagem altera dado: todas são <strong>somente leitura</strong>. Elas não
        corrigem nada e não apagam nada — entregam a contagem e uma amostra de até{' '}
        {MAX_AMOSTRA} identificadores para você investigar.
      </p>

      {checagens === null ? (
        // ANTES de rodar já se mostra o CATÁLOGO: quem abre a tela precisa saber o que vai
        // ser conferido sem ter de disparar a varredura para descobrir. A lista vem de
        // `CHECAGENS` (src/lib/queries/dev.ts), a mesma que casa com a RPC pela chave — não
        // há segunda fonte da verdade aqui.
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            As checagens não rodam sozinhas ao abrir a página. Clique em{' '}
            <strong>Rodar checagens</strong> para conferir cada um destes pontos:
          </p>
          <ul className="space-y-2">
            {catalogo.map((c) => (
              <li key={c.chave} className="rounded-lg border border-dashed p-3">
                <p className="text-sm font-medium">{c.nome}</p>
                <p className="text-xs text-muted-foreground">{c.descricao}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ul className="space-y-2">
          {checagens.map((c) => (
            <LinhaChecagem key={c.chave} c={c} />
          ))}
        </ul>
      )}
    </div>
  )
}

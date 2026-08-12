import { redirect } from 'next/navigation'

import { getOperador } from '@/lib/auth/acesso'
import { formatDate } from '@/lib/format'
import { VERSOES } from '@/lib/versoes/registry'
import { CreditoAutor } from '@/components/layout/credito-autor'
import { LinkAjuda } from '@/components/layout/link-ajuda'
import { Badge } from '@/components/ui/badge'

// Historico de versoes do sistema (F35). Server Component que le SO o registry
// (`src/lib/versoes/registry.ts`) — nenhuma consulta ao banco, nenhum dado do
// acervo. Leitura livre para qualquer perfil ativo, do Consulta ao dev: e o piso
// de leitura do sistema, e nao ha nada aqui para escrever.
//
// O visualizador por senha NAO alcanca esta tela: o proxy so o deixa entrar em
// `/relatorios/**`, e esta rota vive no grupo `(app)`.
export const metadata = {
  title: 'Versões',
  description: 'O que mudou em cada versão do Estoque TI WAP.',
}

export default async function VersoesPage() {
  const operador = await getOperador()
  if (!operador) redirect('/login')

  const atual = VERSOES[0]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Versões</h1>
            <LinkAjuda pagina="versoes-do-sistema" rotulo="Ajuda sobre as versões do sistema" />
          </div>
          <p className="text-sm text-muted-foreground">
            O que mudou em cada versão do sistema, da mais recente para a mais antiga. O sistema
            está na <span className="font-medium tabular-nums text-foreground">v{atual.versao}</span>
            , no ar desde {formatDate(atual.data)}.
          </p>
        </div>
      </div>

      <ol className="space-y-4">
        {VERSOES.map((v, i) => {
          const eAtual = i === 0
          return (
            <li
              key={v.versao}
              className={
                eAtual
                  ? 'rounded-lg border border-brand-amarelo bg-card p-4 shadow-sm'
                  : 'rounded-lg border bg-card p-4'
              }
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-base font-semibold tabular-nums tracking-tight">
                  v{v.versao}
                </h2>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {formatDate(v.data)}
                </span>
                {eAtual ? (
                  <Badge variant="warning" className="text-[10px]">
                    versão atual
                  </Badge>
                ) : null}
                {v.fase ? (
                  <span
                    className="text-[11px] text-muted-foreground/70"
                    title="Nome interno da entrega, para cruzar com a documentação do projeto"
                  >
                    {v.fase}
                  </span>
                ) : null}
              </div>

              <p className="mt-1 text-sm font-medium">{v.titulo}</p>

              <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                {v.mudancas.map((m) => (
                  <li key={m} className="flex gap-2">
                    <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-border" />
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
      </ol>

      <p className="border-t pt-4 text-xs text-muted-foreground">
        Estoque TI WAP · <span className="tabular-nums">v{atual.versao}</span> ·{' '}
        <CreditoAutor />
      </p>
    </div>
  )
}

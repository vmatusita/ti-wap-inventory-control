import { redirect } from 'next/navigation'

import { getOperador } from '@/lib/auth/acesso'
import { formatDate } from '@/lib/format'
import { VERSOES, versaoAtual } from '@/lib/versoes/registry'
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

// F60 · fato 17 — teto de execução ESCRITO, não herdado (ata da F60 em docs/DECISOES.md). Sem
// ele a rota fica com os 300 s da Vercel, e 300 s só acontece quando a conexão com o Supabase
// PENDURA (24/07/2026; o raciocínio inteiro está em relatorios/[filial]/page.tsx): 60 s troca
// cinco minutos de spinner por um erro rápido.
// Esta página não lê `lib/queries`, mas não é estática: chama `getOperador()` (Auth +
// `profiles`) e roda debaixo de `(app)/layout.tsx`, que lê o banco a cada request (filiais
// e os dois selos). O pendurado que o teto corta é o mesmo das outras rotas.
// Esta página não hospeda Server Action própria.
export const maxDuration = 60

export default async function VersoesPage() {
  const operador = await getOperador()
  if (!operador) redirect('/login')

  // `versaoAtual()` e nao `VERSOES[0]`: o registry e a fonte unica, e quem
  // responde "qual esta no ar" e a funcao — a mesma que o `(app)/layout.tsx` usa
  // para o badge da sidebar. Ler o indice aqui abriria um segundo caminho, e o
  // badge e este texto poderiam divergir na mesma tela.
  const atual = versaoAtual()

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Versões</h1>
          <LinkAjuda pagina="versoes-do-sistema" rotulo="Ajuda sobre as versões do sistema" />
        </div>
        {/* O que o codigo miudo da fase significa fica AQUI, visivel e uma vez
            so: no `title` de cada linha ele existia so para quem tem mouse — no
            celular e no teclado a sigla ficava sem explicacao nenhuma. */}
        <p className="text-sm text-muted-foreground">
          O que mudou em cada versão do sistema, da mais recente para a mais antiga. O sistema está
          na <span className="font-medium tabular-nums text-foreground">v{atual.versao}</span>, no ar
          desde {formatDate(atual.data)}. O código miúdo ao lado da data (F35, F20B…) é o nome
          interno da entrega, para cruzar com a documentação do projeto.
        </p>
      </div>

      <ol className="space-y-4">
        {VERSOES.map((v) => {
          const eAtual = v.versao === atual.versao
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
                  // `text-muted-foreground` PURO, sem `/70`: a 70% de alfa este
                  // texto de 11px media 2,71:1 sobre `card` no tema claro e
                  // 4,02:1 no escuro — os dois abaixo do piso AA de 4,5:1. Cheio,
                  // sao 4,73:1 e 6,91:1, o par que `scripts/contraste.mjs` ja
                  // exige. O `/70` nao aparece no script porque ele mede uma
                  // lista fixa de pares e nao varre o codigo: a conta e nossa.
                  <span
                    className="text-[11px] text-muted-foreground"
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

'use client'

import { useEffect, useState } from 'react'
import { Cable, ChevronDown, Cpu, LaptopMinimal, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// F32/RV-19a — o ícone entra por CHAVE (string), não pelo componente lucide.
//
// A primeira versão recebia `icone?: LucideIcon` e o corpo do relatório passava
// `icone={LaptopMinimal}`. Compilou, passou no `tsc`, passou no `eslint` e
// passou no `next build` — e derrubava a rota com HTTP 500 no primeiro request:
// `corpo-relatorio-v2.tsx` é Server Component e este arquivo é `'use client'`,
// e função NÃO atravessa a fronteira RSC ("Functions cannot be passed directly
// to Client Components"). Um componente React é uma função.
//
// Só o navegador pegou. A lição, registrada aqui porque o próximo a acrescentar
// uma prop neste arquivo corre o mesmo risco: **prop de Client Component tem de
// ser serializável** — string, número, objeto simples. O mapa mora do lado do
// cliente, e a fronteira só atravessa a chave.
export type IconeGrupo = 'principais' | 'acessorios' | 'componentes'

const ICONE: Record<IconeGrupo, LucideIcon> = {
  // Genéricos de propósito: cada grupo abriga várias categorias, e um glifo
  // específico (Monitor, Headphones, MemoryStick) sugeriria que o grupo é só
  // aquilo. Nenhum deles colide com os ícones da sidebar.
  principais: LaptopMinimal,
  acessorios: Cable,
  componentes: Cpu,
}

// Seção de grupo recolhível no MOBILE (§3.7): grupos fechados por padrão em
// <768px, exceto o primeiro. No desktop (md+) sempre expandido (md:block); na
// impressão sempre expandido (.grupo-conteudo em @media print). SSR-safe: o
// estado inicial vem só da prop `sempreAberto` (determinístico), sem matchMedia.
// O toggle (com aria-expanded) é só-mobile (md:hidden → não-focável no desktop),
// então o estado ARIA nunca contradiz o conteúdo exibido no desktop.
export function GrupoColapsavel({
  id,
  titulo,
  descricao,
  // RV-19a (análise §2): rolagem rápida não distinguia os 3 GRUPOS das 4
  // tabelas dentro deles — mesma tipografia em tudo. O ícone é marco só do
  // GRUPO (nunca do `CardRelatorio` das tabelas), por isso mora aqui e não
  // vira prop genérica de título. Opcional e decorativo: sem ele, o cabeçalho
  // é bit-a-bit o de antes.
  icone,
  sempreAberto = false,
  children,
}: {
  id: string
  titulo: string
  descricao?: string
  icone?: IconeGrupo
  sempreAberto?: boolean
  children: React.ReactNode
}) {
  const [aberto, setAberto] = useState(sempreAberto)
  const conteudoId = `${id}-conteudo`
  const Icone = icone ? ICONE[icone] : null

  // F29/REL-09b — no celular os grupos nascem FECHADOS, e o chip-âncora rolava até
  // um título com o corpo escondido: o clique parecia não fazer nada. Abrir quando o
  // fragmento aponta para este grupo conserta o mount (link colado/favorito) e o
  // `hashchange` (clique no chip com a página já aberta — o navegador não recarrega).
  //
  // Só ABRE, nunca fecha: sair da âncora não pode recolher um grupo que o leitor
  // acabou de expandir à mão. Roda no cliente (não há `location` no SSR), e no
  // desktop é inofensivo — lá o conteúdo é `md:block` de qualquer forma.
  useEffect(() => {
    const alvo = `#${id}`
    function abrirSeForOAlvo() {
      if (window.location.hash === alvo) setAberto(true)
    }
    abrirSeForOAlvo()
    window.addEventListener('hashchange', abrirSeForOAlvo)
    return () => window.removeEventListener('hashchange', abrirSeForOAlvo)
  }, [id])

  return (
    <section id={id} className="scroll-mt-28 break-before-page space-y-3">
      <div className="flex w-full items-center gap-2">
        {/* `shrink-0` porque títulos como "Acessórios e periféricos" já
            disputam espaço com o botão de 40px no mobile — o ícone não pode
            ser o que cede. `aria-hidden`: o `h2` ao lado já nomeia o grupo. */}
        {Icone && <Icone className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">{titulo}</h2>
          {descricao && <p className="text-xs text-muted-foreground">{descricao}</p>}
        </div>
        {/* O controle mais tocado do relatório no celular tinha 28px. `size-10`
            (40px) é o alvo mínimo; como o botão é `md:hidden`, o desktop não
            muda em nada (F13/B4-R4). */}
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          aria-controls={conteudoId}
          className="ml-auto flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
          aria-label={aberto ? `Recolher ${titulo}` : `Expandir ${titulo}`}
        >
          <ChevronDown className={cn('size-5 transition-transform', aberto && 'rotate-180')} />
        </button>
      </div>

      <div id={conteudoId} className={cn('grupo-conteudo space-y-3.5', !aberto && 'hidden', 'md:block')}>
        {children}
      </div>
    </section>
  )
}

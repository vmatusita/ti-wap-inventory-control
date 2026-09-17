import Link from 'next/link'
import { FileQuestion } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { identidadeDoSistema } from '@/lib/identidade/sistema'

// Boundary de NOT-FOUND da RAIZ — a outra metade do par que `(app)/not-found.tsx`
// começou. A distinção é de contrato do Next, não de gosto (doc do próprio pacote,
// node_modules/next/dist/docs/.../file-conventions/not-found.md):
//   · um `not-found.tsx` de segmento/grupo atende `notFound()` CHAMADO ali dentro;
//   · só o `app/not-found.tsx` da RAIZ atende URL que não casa com rota nenhuma.
// Sem este arquivo, o `(app)/not-found.tsx` cobria os `notFound()` das rotas (ficha
// de ativo, snapshot, /ajuda/[slug]) e uma URL digitada errado seguia caindo no
// `/_not-found` embutido: texto em INGLÊS, que é o sintoma que aquele arquivo diz ter
// fechado. Dava para ver no `next build` — `/_not-found` saía STATIC, prova de que não
// era o do grupo (esse é dinâmico, porque `(app)/layout.tsx` usa `headers()`).
//
// Aqui NÃO há shell, e não é esquecimento: o Next renderiza este arquivo dentro do
// layout RAIZ, sem passar pelo `(app)/layout.tsx` — não há sessão resolvida, então não
// haveria header nem sidebar para montar. O que este arquivo pode entregar, e entrega,
// é português e um caminho de volta.
//
// /relatorios/geral vem PRIMEIRO de propósito: o visualizador por senha é quem fica
// preso numa 404 (o proxy manda tudo fora de /relatorios/** para /login, e ele não tem
// login). Para o operador os dois destinos servem.
// F61 — o nome do sistema sai da fonte única. A 404 declara o título INTEIRO: a
// metadata do `not-found` é aplicada por último, fora da cadeia de segmentos que o
// `template` do layout raiz alcança (doc do Next 16 + `resolve-metadata.ts`).
export const metadata = {
  title: `Página não encontrada · ${identidadeDoSistema().nomeCompleto}`,
}

export default function NaoEncontrado() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
      <FileQuestion className="size-8 text-muted-foreground" />
      <p className="font-medium">Não encontramos esta página</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        O endereço pode estar errado, ou o registro que ele aponta foi removido.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild variant="outline">
          <Link href="/relatorios/geral">Ir para o relatório</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/">Ir para o início</Link>
        </Button>
      </div>
    </div>
  )
}

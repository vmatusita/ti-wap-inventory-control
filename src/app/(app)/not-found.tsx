import Link from 'next/link'
import { FileQuestion } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Boundary de NOT-FOUND da raiz do grupo (app) — a metade que faltava do par que
// o `error.tsx` irmão já cobria. Sem este arquivo, todo `notFound()` do grupo
// (relatorios/gerados/[id], relatorios/[filial], ativos/[id], ajuda/[slug]) caía
// na página padrão do Next: texto em INGLÊS, renderizado no layout RAIZ, ou seja
// FORA do shell — sem header, sem navegação, sem link nenhum de volta. É o mesmo
// sintoma que o cabeçalho do `error.tsx` descreve ter fechado para o ramo de erro.
//
// Quem mais sofria era o VISUALIZADOR por senha: ele não pode sair de
// /relatorios/** (o proxy manda o resto para /login), então uma 404 sem saída era
// literalmente um beco — e ele não tem como diagnosticar nada.
//
// Server Component de propósito: não há estado nem `reset` (diferente do erro,
// aqui repetir a mesma URL nunca ajuda — o recurso não existe). Os dois destinos
// são rotas de relatório porque são as únicas que o visualizador alcança; para o
// operador elas também são caminho válido de volta.
export default function NaoEncontrado() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
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
          <Link href="/relatorios/gerados">Relatórios gerados</Link>
        </Button>
      </div>
    </div>
  )
}

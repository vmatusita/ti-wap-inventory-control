'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { FileQuestion } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { caminhoDaPorta, slugValido } from '@/lib/auth/porta-rotas'

// A 404 DA PORTA PÚBLICA (F68). Sem este arquivo, o `notFound()` da árvore `/r/**` (a diagonal, o gerado de outra empresa,
// a filial que não é da empresa, o slug inexistente) caía no `app/not-found.tsx` da RAIZ — cujos links são do operador
// (`/relatorios/geral` vira um 308 para a porta da WAP, `/` vira o `/login`): o gestor de outra empresa iria parar na
// entrada da WAP. Aqui o caminho de volta é o da MESMA empresa da URL: os gerados (sem sessão, a página leva à entrada
// dela). Cliente só para ler o slug (`useParams`): o not-found não recebe props (doc do Next 16, file-conventions/
// not-found.md). Fica ACIMA do layout da sessão, de propósito: o `notFound()` do próprio layout (a diagonal) também cai
// aqui — sem o shell, como a 404 da raiz.
export default function NaoEncontradoNaPorta() {
  const { empresa } = useParams<{ empresa: string }>()
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
      <FileQuestion className="size-8 text-muted-foreground" />
      <p className="font-medium">Não encontramos esta página</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        O endereço pode estar errado, ou o relatório que ele aponta não existe.
      </p>
      {slugValido(empresa) ? (
        <Button asChild variant="outline">
          <Link href={caminhoDaPorta(empresa, 'gerados')}>Ver os relatórios gerados</Link>
        </Button>
      ) : null}
    </div>
  )
}

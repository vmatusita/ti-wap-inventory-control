import { TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

// F21 — o que um formulário de escrita diz quando o cargo de quem abriu não tem
// NENHUMA filial de escrita (operador criado sem vínculo; a UI de /admin/usuarios
// exige ao menos uma, então isto é o caso que "não deveria acontecer").
//
// Existe porque a alternativa era pior: um select de filial vazio, sem
// explicação, e um "Preencha: filial" no envio — o operador ficaria procurando o
// que ele fez de errado. Sem `'use client'`: é só markup, e serve tanto às
// páginas (Server Components) quanto aos diálogos client que já são bundle.
//
// A mensagem NÃO é a da action (`msgSemEscritaNaFilial`): aqui ninguém tentou
// gravar em filial nenhuma — falta o vínculo antes de escolher.
export function AvisoSemFilialDeEscrita({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        'flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
        className,
      )}
    >
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        Nenhuma filial de escrita vinculada ao seu usuário — você consegue
        consultar, mas não registrar. Peça a um administrador para vincular ao
        menos uma filial.
      </span>
    </p>
  )
}

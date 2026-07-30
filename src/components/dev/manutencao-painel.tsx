'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { revalidarGrupo } from '@/lib/actions/dev'

// Bloco "Manutenção" da /dev (F22): limpar o cache das telas por grupo e os atalhos para os
// painéis dos dois serviços que o projeto usa.
//
// ⚠ A LISTA DE GRUPOS É FECHADA NO SERVIDOR (`GRUPOS_REVALIDACAO`, em
// src/lib/actions/dev.ts). O que vai daqui é só a CHAVE do grupo — nunca um caminho. Um
// `revalidatePath(qualquerCoisa)` vindo do navegador seria uma primitiva de invalidação
// arbitrária, e não há razão para oferecê-la. Se um grupo for acrescentado lá, acrescente o
// rótulo aqui; um grupo desconhecido volta com "Grupo desconhecido." em vez de agir.

const GRUPOS: { chave: string; rotulo: string; descricao: string }[] = [
  {
    chave: 'acervo',
    rotulo: 'Acervo',
    descricao: 'Painel, ativos, movimentações e pendências',
  },
  { chave: 'itens', rotulo: 'Itens', descricao: 'Saldos e histórico dos itens por quantidade' },
  {
    chave: 'relatorios',
    rotulo: 'Relatórios',
    descricao: 'Relatório consolidado ao vivo e o histórico de relatórios gerados',
  },
  {
    chave: 'admin',
    rotulo: 'Administração',
    descricao: 'Usuários, filiais, motivos, catálogo de itens e kits',
  },
]

// URLs de PAINEL, sem projeto, sem token e sem nada que identifique o ambiente. Quem abre
// cai na tela de escolha do serviço já autenticado (ou no login do próprio serviço).
const PAINEIS: { rotulo: string; href: string; descricao: string }[] = [
  {
    rotulo: 'Painel do Supabase',
    href: 'https://supabase.com/dashboard',
    descricao: 'Banco, políticas de acesso, logs e migrations',
  },
  {
    rotulo: 'Painel da Vercel',
    href: 'https://vercel.com/dashboard',
    descricao: 'Deploys, variáveis de ambiente e logs do site',
  },
]

export function ManutencaoPainel() {
  const router = useRouter()
  const [pending, start] = useTransition()
  // Qual botão está rodando: sem isto, o `pending` do useTransition (que é um só) faria os
  // quatro botões dizerem "Limpando…" ao mesmo tempo.
  const [emCurso, setEmCurso] = useState<string | null>(null)

  function limpar(grupo: string, rotulo: string) {
    setEmCurso(grupo)
    start(async () => {
      try {
        const res = await revalidarGrupo({ grupo })
        if (!res.ok) {
          toast.error(res.erro, { duration: 10000 })
          return
        }
        toast.success(res.aviso ?? `Cache de ${rotulo} limpo.`)
        // As telas do grupo já foram invalidadas no servidor; o `refresh` aplica o efeito
        // também na aba aberta, em vez de deixá-la com o render anterior.
        router.refresh()
      } catch {
        toast.error(
          `Não foi possível limpar o cache de ${rotulo}. Nada foi alterado — tente de novo.`,
        )
      } finally {
        setEmCurso(null)
      }
    })
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <p className="max-w-prose text-sm text-muted-foreground">
          Limpar o cache força as telas do grupo a buscarem os dados de novo no próximo
          carregamento. Serve para quando uma tela continua exibindo dado velho depois de uma
          alteração feita direto no banco — <strong>não altera nada</strong>, só descarta o
          que estava guardado.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {GRUPOS.map((g) => (
            <div
              key={g.chave}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{g.rotulo}</p>
                <p className="text-xs text-muted-foreground">{g.descricao}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 gap-2"
                onClick={() => limpar(g.chave, g.rotulo)}
                disabled={pending}
                aria-label={`Limpar o cache de ${g.rotulo}`}
              >
                <RefreshCw className="size-4" aria-hidden />
                {pending && emCurso === g.chave ? 'Limpando…' : 'Limpar cache'}
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Painéis dos serviços</p>
        <div className="flex flex-wrap gap-2">
          {PAINEIS.map((p) => (
            <Button key={p.href} asChild variant="secondary" size="sm" className="gap-2">
              {/* `rel="noreferrer"` junto do `target="_blank"`: sem ele a aba aberta recebe
                  `window.opener` e o referenciador desta tela. */}
              <a
                href={p.href}
                target="_blank"
                rel="noreferrer"
                title={p.descricao}
                aria-label={`${p.rotulo} (abre em nova aba)`}
              >
                {p.rotulo}
                <ExternalLink className="size-4" aria-hidden />
              </a>
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}

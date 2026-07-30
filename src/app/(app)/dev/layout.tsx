import { redirect } from 'next/navigation'
import { getOperador } from '@/lib/auth/acesso'
import { eDev } from '@/lib/auth/papeis'

// Layout da área /dev (F22) — espelho do `admin/layout.tsx`, com o gate um degrau acima:
// aqui não vale hierarquia, vale o cargo EXATO `dev` (`eDev`, que espelha `e_dev()` da
// migration 0072). Um administrador que digitar /dev na barra de endereços cai no painel.
//
// Defesa em profundidade, como em /admin: o proxy só garante "tem sessão", as queries de
// `src/lib/queries/dev.ts` e as actions de `src/lib/actions/dev.ts` repetem `exigirDev()` por
// dentro, e as RPCs de gestão (0074) exigem `e_dev()` no Postgres. Esta checagem existe para
// a ROTA não depender de a sidebar esconder o item.
//
// ⚠ SEM <LinkAjuda> aqui, e é regra, não esquecimento: a /dev está ISENTA da matriz de
// cobertura da documentação (src/lib/ajuda/registry.test.ts) — a documentação do sistema é
// escrita para o operador, e uma rota isenta que renderizasse o "?" quebraria o teste
// "toda rota sem '?' próprio tem o motivo escrito".
export default async function DevLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const operador = await getOperador()
  // Sem sessão OU perfil desativado/arquivado (getOperador devolve null nos três casos).
  if (!operador) redirect('/login')
  // Logado, mas não é Desenvolvedor: o destino é o PAINEL, nunca /login — mandá-lo para a
  // tela de login com sessão válida faria o proxy devolvê-lo para cá, num pingue-pongue.
  if (!eDev(operador.papel)) redirect('/')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Desenvolvedor</h1>
        <p className="text-sm text-muted-foreground">
          Área técnica de manutenção: o que está no ar, checagens de integridade do banco, a
          trilha completa de auditoria e a limpeza de cache das telas. Nada aqui é do dia a
          dia da operação.
        </p>
      </div>
      <div>{children}</div>
    </div>
  )
}

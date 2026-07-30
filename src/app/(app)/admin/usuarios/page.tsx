import { redirect } from 'next/navigation'
import { getOperador } from '@/lib/auth/acesso'
import { listarFiliaisParaVinculo, listarUsuarios } from '@/lib/queries/admin'
import { EVENTOS_PAGE_SIZE, listarEventosAdmin } from '@/lib/queries/eventos-admin'
import { paginaNumerica } from '@/lib/url-params'
import { ConvidarUsuarioDialog } from '@/components/admin/convidar-usuario-dialog'
import { LinkAjuda } from '@/components/layout/link-ajuda'
import { AtivosPaginacao } from '@/components/ativos/ativos-paginacao'
import { AbasUsuarios, ABA_AUDITORIA } from '@/components/admin/usuarios/abas-usuarios'
import { UsuariosTabela } from '@/components/admin/usuarios/usuarios-tabela'
import { AuditoriaFiltro } from '@/components/admin/usuarios/auditoria-filtro'
import { AuditoriaTabela } from '@/components/admin/usuarios/auditoria-tabela'

// /admin/usuarios (F21) — gestão de usuários de verdade: cargo, filiais de escrita,
// desativar/reativar, e a aba Auditoria com a trilha de `eventos_admin`.
//
// O gate de ADMIN está em admin/layout.tsx (rota) e em cada action (`exigirAdmin`), e as
// leituras sensíveis são fechadas pelo próprio Postgres (`eventos_admin` só é legível por
// `e_admin()`). Esta página não repete o gate — repete só o "tem sessão?", porque precisa do
// id do admin logado para as travas de autoproteção da UI.

type SearchParams = { [key: string]: string | string[] | undefined }

function primeiro(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined
}

export default async function AdminUsuariosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const eu = await getOperador()
  if (!eu) redirect('/login')

  const sp = await searchParams
  const aba = primeiro(sp.aba) === ABA_AUDITORIA ? 'auditoria' : 'usuarios'

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-1">
        <p className="text-sm text-muted-foreground">
          Quem tem acesso ao sistema, com que cargo e em que filiais pode registrar
          movimentações.
        </p>
        <LinkAjuda
          pagina="usuarios-e-senhas"
          rotulo="Ajuda sobre usuários, cargos e senhas de acesso"
        />
      </div>

      <AbasUsuarios aba={aba} />

      {aba === 'auditoria' ? (
        <SecaoAuditoria acao={primeiro(sp.acao) ?? null} page={paginaNumerica(primeiro(sp.page))} />
      ) : (
        <SecaoUsuarios euId={eu.id} />
      )}
    </div>
  )
}

async function SecaoUsuarios({ euId }: { euId: string }) {
  const [{ usuarios, avisoAuth }, filiais] = await Promise.all([
    listarUsuarios(),
    listarFiliaisParaVinculo(),
  ])
  const ativos = usuarios.filter((u) => u.ativo).length

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground tabular-nums">
          {ativos} com acesso ativo
          {usuarios.length > ativos && ` · ${usuarios.length - ativos} desativado(s)`}
        </p>
        <ConvidarUsuarioDialog filiais={filiais.filter((f) => f.ativo)} />
      </div>

      {/* O `catch {}` vazio de antes escondia a falha do Auth e mostrava e-mail em branco
          como se a pessoa não tivesse e-mail. Com cargo e banimento na mesma tela, a falha
          silenciosa passaria a esconder coisa pior — então ela virou aviso visível. */}
      {avisoAuth && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {avisoAuth}
        </p>
      )}

      <UsuariosTabela usuarios={usuarios} filiais={filiais} euId={euId} />
    </div>
  )
}

async function SecaoAuditoria({ acao, page }: { acao: string | null; page: number }) {
  const [eventos, filiais] = await Promise.all([
    listarEventosAdmin({ acao, page, pageSize: EVENTOS_PAGE_SIZE }),
    listarFiliaisParaVinculo(),
  ])

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Convites, mudanças de cargo e de filiais, desativações, senhas de acesso e imports —
          quem fez, quando e sobre quem. A trilha não se edita nem se apaga.
        </p>
        <AuditoriaFiltro acao={acao} />
      </div>

      {eventos.total === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {acao
            ? 'Nenhum evento com essa ação ainda.'
            : 'Nenhuma ação administrativa registrada ainda. A trilha começa a partir da F21 — o que aconteceu antes não tem registro.'}
        </p>
      ) : (
        <>
          <AuditoriaTabela linhas={eventos.linhas} filiais={filiais} />
          <AtivosPaginacao
            page={eventos.page}
            pageSize={eventos.pageSize}
            total={eventos.total}
          />
        </>
      )}
    </div>
  )
}

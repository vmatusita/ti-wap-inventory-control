import { AtivosPaginacao } from '@/components/ativos/ativos-paginacao'
import { AuditoriaFiltroDev } from '@/components/dev/auditoria-filtro-dev'
import { AuditoriaTabela } from '@/components/admin/usuarios/auditoria-tabela'
import { ExportarCsvButton } from '@/components/layout/exportar-csv-button'
import type { ListarEventosAdminResult } from '@/lib/queries/eventos-admin'
import type { ResultadoExportCsv } from '@/lib/actions/exportar'

// Bloco "Auditoria completa" da /dev (F22). Server Component: a trilha é leitura pura e o
// Postgres já a fecha (`eventos_admin` só é legível por `e_admin()`).
//
// REAPROVEITA o filtro e a tabela de /admin/usuarios em vez de clonar os dois: o vocabulário
// de ações e a tradução do `detalhe` (jsonb) precisam ser os MESMOS nos dois lugares — uma
// segunda cópia significaria uma ação nova aparecendo traduzida numa tela e crua na outra.
// A diferença desta tela é a PÁGINA MAIOR e o export.
//
// O FILTRO, porém, é PRÓPRIO daqui (`AuditoriaFiltroDev`): a aba de /admin/usuarios recorta
// só por ação, e a ordem F22 §4 pede ação, autor, período e alvo. Lá a trilha é um complemento
// da tela de usuários; aqui ela é o instrumento de auditoria — e, desde que apagar usuário
// existe, o ÚNICO registro de quem foi apagado.
//
// ⚠ Os filtros e a paginação vivem na URL (`?acao=…&autor=…&de=…&ate=…&alvo=…&page=…`).
// Isso é intencional e tem um efeito colateral aceito:
// trocar o filtro re-renderiza a /dev inteira (o diagnóstico é refeito). É uma tela de uma
// pessoa só, visitada raramente — não vale um estado local que duplicaria a lógica.
export function AuditoriaPainel({
  eventos,
  filiais,
  acao,
  autor,
  de,
  ate,
  alvo,
  autores,
  acaoExport,
}: {
  eventos: ListarEventosAdminResult
  filiais: readonly { id: number; nome: string }[]
  acao: string | null
  autor: string | null
  de: string | null
  ate: string | null
  alvo: string | null
  autores: readonly { id: string; nome: string }[]
  /** Server Action de export (mora em `src/app/(app)/dev/acoes-export.ts`, com `exigirDev`). */
  acaoExport: (filtros: string) => Promise<ResultadoExportCsv>
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="max-w-prose text-sm text-muted-foreground">
          A trilha inteira, sem recorte: convites, mudanças de cargo e de filiais,
          desativações, trocas de e-mail, contas apagadas, sessões encerradas, senhas de
          acesso e imports. A trilha não se edita nem se apaga.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <ExportarCsvButton
            acao={acaoExport}
            rotulo="Exportar CSV"
            descricao="da trilha de auditoria filtrada"
            size="sm"
          />
        </div>
      </div>

      <AuditoriaFiltroDev
        acao={acao}
        autor={autor}
        de={de}
        ate={ate}
        alvo={alvo}
        autores={autores}
      />

      {eventos.total === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {acao || autor || de || ate || alvo
            ? 'Nenhum evento com esses filtros.'
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

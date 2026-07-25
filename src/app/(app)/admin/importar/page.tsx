import { createClient } from '@/lib/supabase/server'
import { listarFiliais } from '@/lib/queries/filiais'
import { listarImportLogs } from '@/lib/queries/import-logs'
import { formatDateTime } from '@/lib/format'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { History } from 'lucide-react'
import { EstadoVazio } from '@/components/layout/estado-vazio'
import { LinkAjuda } from '@/components/layout/link-ajuda'
import { ImportarWizard } from '@/components/admin/importar/importar-wizard'
import { BaixarBackupButton } from '@/components/admin/importar/baixar-backup-button'

// admin/importar (OS-F7 / W3): wizard de "Substituir tudo" + histórico de imports.
// Só operador (rota gated pelo proxy + layout de admin). Leituras pelo client
// autenticado (RLS 0031 dá select ao authenticated em import_logs / bucket).
export default async function AdminImportarPage() {
  const client = await createClient()
  const [filiais, logs] = await Promise.all([
    listarFiliais(client),
    listarImportLogs(client),
  ])

  return (
    <div className="space-y-6">
      {/* O <h1> desta tela é o "Administração" do `admin/layout.tsx`: o "?" de lá
          cobre os cadastros de apoio; este acompanha o texto de abertura do
          import e aponta para a página própria do import (F20). */}
      <div className="flex items-start gap-1">
        <p className="text-sm text-muted-foreground">
          Importe o acervo de uma filial a partir do CSV de inventário. O modo é
          sempre <strong>Substituir tudo</strong> (go-live): apaga o acervo atual da
          filial e recria a partir do arquivo.
        </p>
        <LinkAjuda pagina="import-de-startup" rotulo="Ajuda sobre o import de startup" />
      </div>

      <ImportarWizard filiais={filiais} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Histórico de imports</h2>
        {logs.length === 0 ? (
          <EstadoVazio
            icone={History}
            titulo="Nenhum import realizado ainda"
            descricao="Quando um import rodar, ele aparece aqui com o backup do acervo substituído e as contagens de linhas, criados, correções e apagados."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Quem</TableHead>
                  <TableHead>Filial</TableHead>
                  <TableHead className="text-right">Linhas</TableHead>
                  <TableHead className="text-right">Criados</TableHead>
                  <TableHead className="text-right">Correções</TableHead>
                  <TableHead className="text-right">Apagados</TableHead>
                  <TableHead className="text-right">Backup</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {formatDateTime(l.criadoEm)}
                    </TableCell>
                    <TableCell>{l.quem}</TableCell>
                    <TableCell className="font-medium">{l.filialNome}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.totalLinhas.toLocaleString('pt-BR')}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.ativosCriados.toLocaleString('pt-BR')}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {l.correcoes > 0 ? l.correcoes.toLocaleString('pt-BR') : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {l.movsApagadas.toLocaleString('pt-BR')} movs ·{' '}
                      {l.anotacoesApagadas.toLocaleString('pt-BR')} anot ·{' '}
                      {l.termosApagados.toLocaleString('pt-BR')} termos
                    </TableCell>
                    <TableCell className="text-right">
                      <BaixarBackupButton
                        logId={l.id}
                        nomeArquivo={`backup-${l.filialSlug || 'filial'}.json`}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  )
}

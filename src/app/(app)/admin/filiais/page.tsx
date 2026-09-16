import { listarFiliaisAdmin } from '@/lib/queries/admin'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { FilialDialog } from '@/components/admin/filial-dialog'

// FLX-03 — título curto da aba (WCAG 2.4.2).
export const metadata = {
  title: 'Filiais',
}

// F60 · fato 17 — teto de execução ESCRITO, não herdado (ata da F60 em docs/DECISOES.md). Sem
// ele a rota fica com os 300 s da Vercel, e 300 s só acontece quando a conexão com o Supabase
// PENDURA (24/07/2026; o raciocínio inteiro está em relatorios/[filial]/page.tsx): 60 s troca
// cinco minutos de spinner por um erro rápido.
// O teto vale também para as Server Actions desta página (doc do Next: o `maxDuration` da
// página muda o de todas as actions usadas nela). Cada statement delas já para nos 8 s de
// `statement_timeout` do banco (fato 18), então o que decide é o LAÇO, e aqui não há laço
// que cresça com o acervo:
// `criarFilial`/`atualizarFilial` e os dois de apelido são uma escrita cada.
export const maxDuration = 60

export default async function AdminFiliaisPage() {
  const filiais = await listarFiliaisAdmin()

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {filiais.length} filial(is) cadastrada(s).
        </p>
        <FilialDialog />
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead className="hidden md:table-cell">Slug</TableHead>
              {/* F56 (Frente E · Decisão 13) — os apelidos que também reconhecem esta
                  filial na coluna Site do import. */}
              <TableHead className="hidden lg:table-cell">Na coluna Site do import</TableHead>
              <TableHead>Ativos</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filiais.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-medium">{f.nome}</TableCell>
                <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                  {f.slug}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {f.apelidos.length === 0 ? (
                    <span className="text-xs text-muted-foreground">Só o nome próprio</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {f.apelidos.map((a) => (
                        <Badge key={a.id} variant="secondary" className="text-xs">
                          {a.apelido}
                        </Badge>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell className="tabular-nums">
                  {f.totalAtivos.toLocaleString('pt-BR')}
                </TableCell>
                <TableCell>
                  {f.ativo ? (
                    <Badge className="border-transparent bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">
                      Ativa
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Inativa</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <FilialDialog filial={f} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Diagnostico } from '@/lib/queries/dev'

// Bloco "Diagnóstico" da /dev (F22): o que está no ar AGORA. Server Component puro — o dado
// chega pronto de `getDiagnostico()`, que já é guardado por `exigirDev()`.
//
// ⚠ NADA DE SEGREDO NESTA TELA. O que aparece é commit/branch/ambiente (metadados de build
// que a Vercel injeta), o ref do projeto Supabase JÁ MASCARADO pela query e CONTAGENS de
// linha. Nenhuma chave, nenhum hash, nenhuma URL assinada — a regra está no cabeçalho de
// `src/lib/queries/dev.ts` e vale para quem for acrescentar uma linha aqui.

function Campo({ rotulo, valor, mono }: { rotulo: string; valor: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd
        className={
          mono
            ? 'truncate font-mono text-sm tabular-nums'
            : 'truncate text-sm'
        }
        title={valor}
      >
        {valor}
      </dd>
    </div>
  )
}

export function DiagnosticoPainel({ diagnostico }: { diagnostico: Diagnostico }) {
  const d = diagnostico

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
        <Campo rotulo="Ambiente" valor={d.ambiente} />
        <Campo rotulo="Branch" valor={d.branch} />
        <Campo rotulo="Commit" valor={d.commit} mono />
        <Campo rotulo="Projeto Supabase" valor={d.refSupabase} mono />
        <Campo rotulo="Última migration do repositório" valor={d.migracaoNoRepo} mono />
        <Campo rotulo="Versão registrada no banco" valor={d.migracaoNoBanco} mono />
      </dl>

      {d.mensagemCommit !== 'indisponível' && (
        <p className="text-sm text-muted-foreground">
          <span className="text-xs">Mensagem do commit: </span>
          {d.mensagemCommit}
        </p>
      )}

      {/* Por que os dois números aparecem lado a lado SEM veredito: o repositório numera as
          migrations em sequência (`0077_dev_diagnostico`) e o banco registra a versão no
          formato de carimbo de tempo do Supabase CLI (`20260730123751`). Não são a mesma
          grandeza — qualquer comparação automática entre eles daria um "em dia"/"atrasado"
          inventado. Aqui os dois são exibidos e quem lê compara sabendo o que cada um é. */}
      <p className="text-xs text-muted-foreground">
        Os dois valores acima usam numerações diferentes (sequencial no repositório, carimbo
        de tempo no banco) e por isso não se comparam automaticamente — confira à mão quando
        desconfiar de que um deploy foi ao ar sem a migration.
      </p>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tabela</TableHead>
              <TableHead className="text-right">Linhas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {d.contagens.map((c) => (
              <TableRow key={c.tabela}>
                <TableCell className="font-mono text-xs">{c.tabela}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {/* `null` = a contagem FALHOU (relação inexistente, permissão, timeout).
                      Zero é um número legítimo e não pode ser confundido com falha. */}
                  {c.linhas === null ? (
                    <span className="text-amber-700 dark:text-amber-400">não lida</span>
                  ) : (
                    c.linhas.toLocaleString('pt-BR')
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

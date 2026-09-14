import { createClient } from '@/lib/supabase/server'
import { listarFiliais } from '@/lib/queries/filiais'
import { listarImportLogs } from '@/lib/queries/import-logs'
import { lerVocabularioImport } from '@/lib/queries/vocabulario-import'
import { paraCliente, VocabularioImportInvalidoError } from '@/lib/import'
import { registrarFalha } from '@/lib/observabilidade'
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
import { Aviso } from '@/components/layout/aviso'
import { EstadoVazio } from '@/components/layout/estado-vazio'
import { LinkAjuda } from '@/components/layout/link-ajuda'
import { ImportarWizard } from '@/components/admin/importar/importar-wizard'
import { BaixarBackupButton } from '@/components/admin/importar/baixar-backup-button'

// FLX-03 — título curto da aba (WCAG 2.4.2).
export const metadata = {
  title: 'Importar',
}

// admin/importar (OS-F7 / W3): wizard de "Substituir tudo" + histórico de imports.
// F21 — só o cargo ADMIN: a rota é fechada pelo `admin/layout.tsx`, a action
// `aplicarImport` exige `exigirAdmin()`, a RPC `importar_ativos_substituir` tem
// guarda `e_admin()` e a leitura de `import_logs` passou a exigir admin no RLS
// (migration 0063 / ADR-002 §4.2). O select de filial do wizard segue com a lista
// inteira: admin escreve em todas.
// Leituras pelo client autenticado (com a sessão de admin).
export default async function AdminImportarPage() {
  const client = await createClient()
  const [filiais, logs, leituraVocabulario] = await Promise.all([
    listarFiliais(client),
    listarImportLogs(client),
    // F56 · revisão adversarial final (achado baixo) — as duas actions do motor já
    // tratavam a falha de leitura do vocabulário com mensagem própria; a PÁGINA caía no
    // boundary genérico. Um vocabulário que `conferirVocabulario` recusa (ambíguo ou
    // incompleto) derruba só o wizard, com o motivo à vista — o histórico continua lá.
    lerVocabularioImport(client).then(
      (vocabulario) => ({ ok: true as const, vocabulario }),
      (erro: unknown) => ({ ok: false as const, erro }),
    ),
  ])
  if (!leituraVocabulario.ok) {
    registrarFalha({ escopo: 'import.vocabulario', erro: leituraVocabulario.erro, ctx: { tela: 'admin/importar' } })
  }

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

      {/* F56 · Frente D — SÓ a fatia de cliente (`paraCliente`) desce por prop: o
          Server Component leu o vocabulário inteiro (`filiais`/`apelidos` inclusos)
          para as duas actions do motor lerem de novo do banco; o wizard e os cards
          recebem só o que precisam para EXIBIR (Select, "Definir como", o painel do
          hostname) — nunca julgam com ele. */}
      {leituraVocabulario.ok ? (
        <ImportarWizard filiais={filiais} vocabulario={paraCliente(leituraVocabulario.vocabulario)} />
      ) : (
        <Aviso intencao="erro">
          <p>
            O import está indisponível: não foi possível ler o vocabulário do import (os nomes e
            apelidos das filiais, as categorias, os estados e os prefixos de patrimônio).
            {leituraVocabulario.erro instanceof VocabularioImportInvalidoError
              ? ` ${leituraVocabulario.erro.message} Confira os apelidos em Administração › Filiais.`
              : ' Recarregue a página; se continuar, avise quem cuida do sistema.'}
          </p>
        </Aviso>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Histórico de imports</h2>
        {logs.length === 0 ? (
          <EstadoVazio
            icone={History}
            titulo="Nenhum import realizado ainda"
            descricao="Quando um import rodar, ele aparece aqui com o backup do acervo substituído e as contagens de linhas, criados, correções, conflitos abertos e apagados."
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
                  <TableHead className="text-right">Conflitos</TableHead>
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
                    {/* F24 — âmbar quando > 0: é trabalho que este import deixou na fila
                        de Pendências, não um defeito. Imports anteriores à fase mostram
                        '—' porque o conflito nem podia existir na época. */}
                    <TableCell
                      className={
                        l.conflitosAbertos > 0
                          ? 'text-right tabular-nums text-warning'
                          : 'text-right tabular-nums text-muted-foreground'
                      }
                    >
                      {l.conflitosAbertos > 0
                        ? l.conflitosAbertos.toLocaleString('pt-BR')
                        : '—'}
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

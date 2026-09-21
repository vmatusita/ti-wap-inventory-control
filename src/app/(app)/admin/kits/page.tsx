import { Copy, Layers } from 'lucide-react'
import { listarKitsAdmin } from '@/lib/queries/kits'
import { listarMotivos } from '@/lib/queries/motivos'
import { rotuloCategoria, rotuloTipo } from '@/lib/dominio'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EstadoVazio } from '@/components/layout/estado-vazio'
import { KitDialog } from '@/components/admin/kit-dialog'
import { LinkAjuda } from '@/components/layout/link-ajuda'

// FLX-03 — título curto da aba (WCAG 2.4.2).
export const metadata = {
  title: 'Kits',
}

// F60 · fato 17 — teto de execução ESCRITO, não herdado (ata da F60 em docs/DECISOES.md). Sem
// ele a rota fica com os 300 s da Vercel, e 300 s só acontece quando a conexão com o Supabase
// PENDURA (24/07/2026; o raciocínio inteiro está em relatorios/[filial]/page.tsx): 60 s troca
// cinco minutos de spinner por um erro rápido.
// O teto vale também para as Server Actions desta página (doc do Next: o `maxDuration` da
// página muda o de todas as actions usadas nela). Cada statement delas já para nos 8 s de
// `statement_timeout` do banco (fato 18), então o que decide é o LAÇO, e aqui não há laço
// que cresça com o acervo:
// `criarKit`/`atualizarKit` são uma escrita cada.
export const maxDuration = 60

// Catálogo de KITS DE MOVIMENTAÇÃO (F12 · M12 — promessa da F5 §5.9). Rota de
// operador (o layout de /admin já exige sessão de operador; o visualizador por
// senha só alcança /relatorios/**).
export default async function AdminKitsPage() {
  const [{ kits, invalidos }, motivos] = await Promise.all([
    listarKitsAdmin(),
    listarMotivos(),
  ])

  // `listarMotivos` traz só os ATIVOS: um kit salvo com motivo desativado depois
  // cai no fallback e mostra o código cru — sinal visível de que aquele preset
  // precisa de revisão (ao aplicar, o fluxo limpa o motivo e avisa).
  const rotuloDoMotivo = (codigo?: string) =>
    codigo ? (motivos.find((m) => m.codigo === codigo)?.rotulo ?? codigo) : '—'

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-1">
          <p className="text-sm text-muted-foreground">
            Modelos salvos do passo 2 da movimentação — aplicados com um clique em
            Nova movimentação.
          </p>
          <LinkAjuda pagina="kits-de-movimentacao" rotulo="Ajuda sobre os kits de movimentação" />
        </div>
        <KitDialog motivos={motivos} />
      </div>

      {/* Kit cujo `payload` jsonb não passa no contrato é descartado na leitura
          (queries/kits.ts). Sem esta linha ele SUMIA da tela sem explicação — e
          o nome dele continua no índice único, então recriá-lo com o mesmo nome
          falha com "Já existe um kit com esse nome.". Dizer que existe já
          resolve o beco: o operador usa outro nome ou pede a correção do
          registro. (Revisão adversarial da F12.) */}
      {invalidos > 0 && (
        <p
          role="status"
          className="rounded-lg border border-callout-atencao-borda bg-amber-50 px-3 py-2 text-sm text-callout-atencao-texto dark:bg-amber-950"
        >
          {invalidos === 1
            ? '1 kit não pôde ser lido (configuração fora do formato esperado) e não aparece na lista.'
            : `${invalidos.toLocaleString('pt-BR')} kits não puderam ser lidos (configuração fora do formato esperado) e não aparecem na lista.`}{' '}
          O nome deles continua reservado — para reaproveitá-lo, crie o kit com
          outro nome ou peça a correção do registro no banco.
        </p>
      )}

      {kits.length === 0 ? (
        <EstadoVazio
          icone={Layers}
          titulo="Nenhum kit cadastrado"
          descricao="Um kit guarda tipo, motivo, termo, observação e as categorias esperadas — ex.: “Kit novo colaborador” = notebook + monitor + celular."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="hidden md:table-cell">Motivo</TableHead>
                <TableHead className="hidden lg:table-cell">
                  Categorias esperadas
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {kits.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.nome}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal">
                      {rotuloTipo(k.payload.tipo)}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {rotuloDoMotivo(k.payload.motivo)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex max-w-md flex-wrap gap-1">
                      {k.payload.categorias.map((c) => (
                        <Badge key={c} variant="outline" className="font-normal">
                          {rotuloCategoria(c)}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {k.ativo ? (
                      <Badge variant="sucesso">
                        Ativo
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Inativo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <KitDialog
                        kit={{
                          id: k.id,
                          nome: k.nome,
                          payload: k.payload,
                          ativo: k.ativo,
                        }}
                        motivos={motivos}
                      />
                      {/* F29/ADM-04b — kit não se exclui (só desativa), então errar na
                          criação gerava lixo permanente e um kit parecido nascia do
                          zero. "Duplicar" abre o mesmo diálogo em modo CRIAÇÃO com o
                          payload copiado e o nome "Cópia de …" (o índice único de nome
                          barraria a repetição). O original não é tocado. */}
                      <KitDialog
                        duplicarDe={{
                          id: k.id,
                          nome: k.nome,
                          payload: k.payload,
                          ativo: k.ativo,
                        }}
                        motivos={motivos}
                        gatilho={
                          <Button
                            variant="outline"
                            size="sm"
                            className="min-h-10 gap-1.5 sm:min-h-0"
                          >
                            <Copy className="size-3.5" />
                            Duplicar
                          </Button>
                        }
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

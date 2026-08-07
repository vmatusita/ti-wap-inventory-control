import { Layers } from 'lucide-react'
import { listarKitsAdmin } from '@/lib/queries/kits'
import { listarMotivos } from '@/lib/queries/motivos'
import { rotuloCategoria, rotuloTipo } from '@/lib/dominio'
import { Badge } from '@/components/ui/badge'
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
          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
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
                      <Badge className="border-transparent bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">
                        Ativo
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Inativo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <KitDialog
                      kit={{
                        id: k.id,
                        nome: k.nome,
                        payload: k.payload,
                        ativo: k.ativo,
                      }}
                      motivos={motivos}
                    />
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

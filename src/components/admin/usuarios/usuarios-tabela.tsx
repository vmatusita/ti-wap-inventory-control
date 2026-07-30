import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { formatDate, ouTraco } from '@/lib/format'
import { PAPEL_ROTULO } from '@/lib/auth/papeis'
import type { PapelUsuario } from '@/lib/auth/papeis'
import type { FilialParaVinculo, UsuarioAdmin } from '@/lib/queries/admin'
import { EditarUsuarioDialog } from '@/components/admin/usuarios/editar-usuario-dialog'
import { StatusUsuarioAcoes } from '@/components/admin/usuarios/status-usuario-acoes'

// Tabela de usuários de /admin/usuarios (F21): nome, e-mail, CARGO, FILIAIS DE ESCRITA e
// SITUAÇÃO, com editar e desativar/reativar por linha. Server Component; só os diálogos de
// escrita são cliente.

// O que a coluna "Filiais de escrita" diz, por cargo. Admin não tem (nem precisa de) linha
// em `operador_filiais`; consulta não escreve em lugar nenhum. Mostrar a lista crua para os
// três cargos faria a tela sugerir que um Consulta com vínculo antigo escreve em algum lugar.
function textoFiliais(
  papel: PapelUsuario,
  vinculos: readonly number[],
  filiais: readonly FilialParaVinculo[],
): { texto: string; alerta: boolean } {
  if (papel === 'admin') return { texto: 'Todas as filiais', alerta: false }
  if (papel === 'consulta') return { texto: 'Não registra nada', alerta: false }
  if (vinculos.length === 0) {
    // Estado possível e importante de enxergar: operador sem vínculo nenhum lê tudo e não
    // escreve nada (falha segura da 0061). Sem este aviso, a pessoa abriria um chamado
    // dizendo "o sistema não me deixa salvar".
    return { texto: 'Nenhuma — não consegue registrar nada', alerta: true }
  }
  // Vínculo apontando para filial DESATIVADA aparece marcado: ele não vale (a filial saiu
  // do universo de escrita), e um número sem explicação viraria suporte.
  const nomes = vinculos.map((id) => {
    const f = filiais.find((x) => x.id === id)
    if (!f) return `filial ${id}`
    return f.ativo ? f.nome : `${f.nome} (inativa)`
  })
  return { texto: nomes.join(', '), alerta: false }
}

// Opções do formulário de edição DESTE usuário: as filiais ativas + as INATIVAS em que ele
// ainda tem vínculo. As inativas entram marcadas com o sufixo, e não escondidas, porque o
// diálogo devolve à action a lista COMPLETA e a action apaga-e-regrava: uma filial desativada
// que não aparecesse como opção sairia do payload e o vínculo seria apagado em silêncio —
// invisível até alguém reativar a filial e o operador descobrir que perdeu a permissão.
// Aparecendo, o admin ou mantém (default, já marcada) ou desmarca de propósito.
function opcoesDoUsuario(
  vinculos: readonly number[],
  filiais: readonly FilialParaVinculo[],
): { id: number; nome: string }[] {
  return filiais
    .filter((f) => f.ativo || vinculos.includes(f.id))
    .map((f) => ({ id: f.id, nome: f.ativo ? f.nome : `${f.nome} (inativa)` }))
}

export function UsuariosTabela({
  usuarios,
  filiais,
  euId,
}: {
  usuarios: readonly UsuarioAdmin[]
  filiais: readonly FilialParaVinculo[]
  /** Id do admin logado — as travas de autoproteção também desabilitam os botões dele. */
  euId: string
}) {

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>E-mail</TableHead>
            <TableHead>Cargo</TableHead>
            <TableHead>Filiais de escrita</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead className="hidden lg:table-cell">Criado em</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {usuarios.map((u) => {
            const eVoceMesmo = u.id === euId
            const filiaisTexto = textoFiliais(u.papel, u.vinculos, filiais)
            const nome = u.nome?.trim() || u.email || 'Sem nome'
            return (
              <TableRow key={u.id} className={u.ativo ? undefined : 'opacity-60'}>
                <TableCell className="font-medium">
                  {nome}
                  {eVoceMesmo && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      (você)
                    </span>
                  )}
                </TableCell>
                <TableCell className="break-all text-muted-foreground">
                  {ouTraco(u.email)}
                </TableCell>
                <TableCell>
                  <Badge variant={u.papel === 'admin' ? 'default' : 'secondary'}>
                    {PAPEL_ROTULO[u.papel]}
                  </Badge>
                </TableCell>
                <TableCell
                  className={
                    filiaisTexto.alerta ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'
                  }
                >
                  {filiaisTexto.texto}
                </TableCell>
                <TableCell>
                  {u.ativo ? (
                    <span className="text-sm">Ativo</span>
                  ) : (
                    <Badge variant="destructive">Desativado</Badge>
                  )}
                  {/* Divergência entre o banco e o Auth: normalmente `banido` espelha
                      `!ativo`. Quando não espelha, uma das duas metades da (des)ativação
                      ficou pela metade — e o admin precisa ver isso, não adivinhar. */}
                  {u.ativo && u.banido === true && (
                    <p className="text-xs text-destructive">
                      Login bloqueado no Auth — reative para liberar a entrada.
                    </p>
                  )}
                  {!u.ativo && u.banido === false && (
                    <p className="text-xs text-destructive">
                      Ainda consegue fazer login (mas não escreve nada) — desative de novo.
                    </p>
                  )}
                </TableCell>
                <TableCell className="hidden tabular-nums text-muted-foreground lg:table-cell">
                  {formatDate(u.created_at)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap justify-end gap-2">
                    <EditarUsuarioDialog
                      usuarioId={u.id}
                      nome={nome}
                      papelAtual={u.papel}
                      vinculosAtuais={u.vinculos}
                      filiais={opcoesDoUsuario(u.vinculos, filiais)}
                      eVoceMesmo={eVoceMesmo}
                    />
                    <StatusUsuarioAcoes
                      usuarioId={u.id}
                      nome={nome}
                      ativo={u.ativo}
                      eVoceMesmo={eVoceMesmo}
                    />
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

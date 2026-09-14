'use client'

import { useId, useMemo, useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Search, Wrench } from 'lucide-react'
import { formatDate, ouTraco } from '@/lib/format'
import { casaBusca } from '@/lib/ajuda/busca'
import { aguardandoPrimeiroAcesso } from '@/lib/validators/admin'
import { PAPEL_ROTULO, eAdmin, eDev } from '@/lib/auth/papeis'
import type { PapelUsuario } from '@/lib/auth/papeis'
import type { FilialParaVinculo, UsuarioAdmin } from '@/lib/queries/admin'
import { EditarUsuarioDialog } from '@/components/admin/usuarios/editar-usuario-dialog'
import { StatusUsuarioAcoes } from '@/components/admin/usuarios/status-usuario-acoes'
import { AcoesDev } from '@/components/admin/usuarios/acoes-dev'
import { GerarLinkAcesso } from '@/components/admin/usuarios/gerar-link-acesso'

// Tabela de usuários de /admin/usuarios (F21; cargo `dev` na F22): nome, e-mail, CARGO,
// FILIAIS DE ESCRITA e SITUAÇÃO, com editar e desativar/reativar por linha.
//
// F29/ADM-03a — virou Client Component por causa do FILTRO. O array inteiro já vem
// pronto do servidor (a lista é de dezenas de linhas e não pagina, por decisão da F21),
// então o filtro é em memória: nada de round-trip por tecla digitada. Os diálogos de
// escrita já eram cliente, então o aninhamento não muda.

// F22 — a frase que a linha de um Desenvolvedor mostra a quem não é dev. Uma conta dev não se
// edita, não se desativa e não se apaga por fora do próprio cargo: quem recusa é o banco (a
// rede `profiles_guarda_dev` da 0073 e a guarda `exigir_gestao_de()` das RPCs da 0074), e o
// botão desabilitado existe só para a recusa não chegar como surpresa depois do clique.
const BLOQUEIO_DEV =
  'Gerido por desenvolvedor — só outro Desenvolvedor altera, desativa ou apaga esta conta.'

// O que a coluna "Filiais de escrita" diz, por cargo. Nível administrador (admin e dev) não
// tem (nem precisa de) linha em `operador_filiais`; consulta não escreve em lugar nenhum.
// Mostrar a lista crua para todos os cargos faria a tela sugerir que um Consulta com vínculo
// antigo escreve em algum lugar.
//
// ⚠ F22: o primeiro ramo era `papel === 'admin'`. Com a igualdade, um Desenvolvedor caía no
// ramo de baixo e a tela dizia, EM VERMELHO, "Nenhuma — não consegue registrar nada" sobre a
// conta com MAIS poder de escrita do sistema. `eAdmin` é hierarquia desde a F22 e cobre os
// dois — é o mesmo predicado que `escopoDeEscrita()` e `pode_escrever_filial()` usam.
function textoFiliais(
  papel: PapelUsuario,
  vinculos: readonly number[],
  filiais: readonly FilialParaVinculo[],
): { texto: string; alerta: boolean } {
  if (eAdmin(papel)) return { texto: 'Todas as filiais', alerta: false }
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

// F29/ADM-03a — o texto que a busca varre: nome, e-mail, RÓTULO do cargo e NOMES das
// filiais de escrita. Rótulos e nomes, não chaves e ids: quem procura digita
// "Administrador" (não "admin") e "Matriz" (não "3").
function textoBuscavel(u: UsuarioAdmin, filiais: readonly FilialParaVinculo[]): string {
  const nomesFiliais = u.vinculos
    .map((id) => filiais.find((f) => f.id === id)?.nome ?? '')
    .join(' ')
  return [u.nome ?? '', u.email ?? '', PAPEL_ROTULO[u.papel], nomesFiliais].join(' ')
}

export function UsuariosTabela({
  usuarios,
  filiais,
  euId,
  euPapel,
  authIndisponivel = false,
}: {
  usuarios: readonly UsuarioAdmin[]
  filiais: readonly FilialParaVinculo[]
  /** Id do admin logado — as travas de autoproteção também desabilitam os botões dele. */
  euId: string
  /**
   * F22 — CARGO de quem está olhando a tela. Antes só o `euId` chegava até aqui, e sem o
   * cargo a tabela não tinha como distinguir um admin de um dev: ofereceria a um
   * Administrador ações que o banco recusa (mexer numa conta dev, apagar conta) e esconderia
   * do dev as que só ele tem. Vem de `getOperador()`, memoizado por request.
   */
  euPapel: PapelUsuario
  /** F29 — o Supabase Auth não respondeu: `ultimoAcesso` é indeterminado, não "nunca". */
  authIndisponivel?: boolean
}) {
  const souDev = eDev(euPapel)
  const buscaId = useId()
  const [busca, setBusca] = useState('')

  const visiveis = useMemo(
    () => usuarios.filter((u) => casaBusca(textoBuscavel(u, filiais), busca)),
    [usuarios, filiais, busca],
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={buscaId}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, e-mail, cargo ou filial…"
            aria-label="Buscar usuário por nome, e-mail, cargo ou filial"
            autoComplete="off"
            className="h-10 pl-8 sm:h-8"
          />
        </div>
        {/* A contagem responde "sumiu o resto ou não existe?" — sem ela, uma busca que
            não casa nada é indistinguível de uma lista vazia. `role="status"` porque o
            número muda enquanto se digita. */}
        <p role="status" className="text-sm text-muted-foreground tabular-nums">
          {busca.trim()
            ? `${visiveis.length} de ${usuarios.length}`
            : `${usuarios.length} no total`}
        </p>
      </div>

      {visiveis.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          Nenhum usuário casa com “{busca.trim()}”.
        </div>
      ) : (
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
              {visiveis.map((u) => {
                const eVoceMesmo = u.id === euId
                const filiaisTexto = textoFiliais(u.papel, u.vinculos, filiais)
                const nome = u.nome?.trim() || u.email || 'Sem nome'
                // Linha de Desenvolvedor olhada por quem não é dev: editar e desativar/reativar
                // ficam desabilitados com a explicação. Um dev vê a linha de outro dev normal.
                const bloqueio = eDev(u.papel) && !souDev ? BLOQUEIO_DEV : null
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
                      {/* Cargo de NÍVEL ADMINISTRADOR (admin e dev) em destaque; operador e
                          consulta em cinza. O Desenvolvedor ganha ainda o ícone de chave, para
                          não se confundir com o Administrador no meio de uma lista longa — a
                          distinção é por ícone, e não por uma cor nova, porque `badge.tsx` só
                          tem os variants abaixo e a F22 não instala componente nenhum. */}
                      <Badge variant={eAdmin(u.papel) ? 'default' : 'secondary'}>
                        {eDev(u.papel) && <Wrench aria-hidden="true" />}
                        {PAPEL_ROTULO[u.papel]}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={
                        filiaisTexto.alerta
                          ? 'text-sm text-destructive'
                          : 'text-sm text-muted-foreground'
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
                      {/* F29/ADM-02a — convidado que nunca terminou de entrar era
                          indistinguível de quem usa o sistema todo dia ("Sem nome" ·
                          Ativo), e não havia como saber se o link tinha sido usado. */}
                      {aguardandoPrimeiroAcesso(u, authIndisponivel) && (
                        <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
                          Aguardando primeiro acesso
                        </p>
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
                          autorEDev={souDev}
                          bloqueio={bloqueio}
                        />
                        <StatusUsuarioAcoes
                          usuarioId={u.id}
                          nome={nome}
                          ativo={u.ativo}
                          eVoceMesmo={eVoceMesmo}
                          bloqueio={bloqueio}
                        />
                        {/* F29/ADM-02b — reobter o acesso exigia deduzir que se devia
                            reabrir "Convidar usuário" e REDIGITAR o e-mail que está na
                            coluna ao lado. Some quando a linha não tem e-mail legível (o
                            Auth não respondeu) — sem e-mail não há para quem gerar link —
                            e quando a linha é de um dev olhada por quem não é dev: abrir
                            um link de recuperação daquela conta é assumi-la. */}
                        {u.email && !bloqueio && (
                          <GerarLinkAcesso email={u.email} nome={nome} />
                        )}
                        {/* Gestão avançada (alterar e-mail, encerrar sessões, apagar conta) só
                            para o cargo Desenvolvedor: para os demais o menu não existe, em vez
                            de existir desabilitado — não é uma ação bloqueada nesta linha, é uma
                            ação que o cargo deles não tem em linha nenhuma. */}
                        {souDev && (
                          <AcoesDev
                            usuarioId={u.id}
                            nome={nome}
                            email={u.email}
                            eVoceMesmo={eVoceMesmo}
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

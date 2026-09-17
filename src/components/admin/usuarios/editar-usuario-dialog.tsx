'use client'

import { useCallback, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Dica } from '@/components/ui/dica'
import { editarUsuario } from '@/lib/actions/admin'
import { exigeVinculoDeFilial, validarVinculosDoPapel } from '@/lib/auth/papeis'
import type { PapelUsuario } from '@/lib/auth/papeis'
import { CargoEFiliais, type FilialOpcao } from '@/components/admin/usuarios/cargo-e-filiais'
import { useDialogoSemeado } from '@/components/dialogos/use-dialogo-semeado'

// Editar CARGO e FILIAIS DE ESCRITA de quem já existe (F21). Não edita nome nem e-mail: o
// nome é a própria pessoa que informa em /auth/definir-senha, e trocar e-mail é criar outro
// acesso (novo convite).
//
// As duas travas de autoproteção (não mexer no próprio cargo; nunca ficar sem administrador
// ativo) vivem no SERVIDOR — `validarTrocaDePapel` em validators/admin.ts, conferidas contra
// a contagem lida na hora. Aqui o botão do próprio usuário já vem desabilitado para o admin
// não descobrir a regra por tentativa e erro, mas quem recusa é a action.
export function EditarUsuarioDialog({
  usuarioId,
  nome,
  papelAtual,
  vinculosAtuais,
  filiais,
  eVoceMesmo,
  autorEDev,
  bloqueio,
}: {
  usuarioId: string
  nome: string
  papelAtual: PapelUsuario
  vinculosAtuais: readonly number[]
  filiais: readonly FilialOpcao[]
  eVoceMesmo: boolean
  /** F22 — só um dev vê (e concede) o cargo Desenvolvedor no <Select> de cargo. */
  autorEDev: boolean
  /**
   * F22 — motivo pelo qual esta linha NÃO pode ser editada por quem está logado (hoje:
   * a linha é de um Desenvolvedor e o autor não é dev). Preenchido, o botão vem
   * desabilitado com a explicação; o diálogo nem chega a existir. É ergonomia — quem
   * recusa de verdade é a RPC (`exigir_gestao_de`, 0074) e a rede `profiles_guarda_dev`.
   */
  bloqueio?: string | null
}) {
  const router = useRouter()
  const [papel, setPapel] = useState<PapelUsuario>(papelAtual)

  // Vínculo só entra no formulário para o cargo que REALMENTE o usa (Operador).
  //
  // Achado da revisão adversarial da F21: sem o `exigeVinculoDeFilial`, este diálogo abria
  // com erro vermelho e "Salvar" desabilitado para **todos os usuários atuais**. O backfill
  // da 0061 deu a TODO perfil vínculo em todas as filiais ativas (é o que faz o deploy não
  // mudar comportamento — ADR-002 §6), então um Administrador de verdade chega aqui com a
  // lista cheia, e `validarVinculosDoPapel('admin', [1..6])` recusa lista não vazia. As
  // linhas em `operador_filiais` de um admin são dado MORTO (`pode_escrever_filial` devolve
  // true para admin sem consultá-las) — logo o certo é ignorá-las, não exibi-las.
  //
  // Os vínculos entram TODOS, inclusive os que apontam para filial desativada — a lista
  // `filiais` que a tabela manda já inclui as inativas deste usuário, marcadas "(inativa)".
  // Antes filtrava-se pelas ativas, e como a action apaga-e-regrava os vínculos, abrir o
  // diálogo e salvar (mesmo sem mexer nesse campo) APAGAVA em silêncio o vínculo da filial
  // desativada: ninguém descobria até a filial ser reativada e o operador perder a permissão.
  // O `some` continua ali só para não devolver id que não é opção nenhuma (filial excluída).
  const vinculosIniciais = useCallback(
    (p: PapelUsuario) =>
      p === papelAtual && exigeVinculoDeFilial(p)
        ? vinculosAtuais.filter((id) => filiais.some((f) => f.id === id))
        : [],
    [papelAtual, vinculosAtuais, filiais],
  )

  const [escolhidas, setEscolhidas] = useState<number[]>(() => vinculosIniciais(papelAtual))
  const [salvando, start] = useTransition()
  // Reabrir volta ao estado do servidor — nunca ao rascunho abandonado da vez anterior.
  // F61 — a mesma regra, agora com nome (`useDialogoSemeado`), chamada ANTES do
  // retorno antecipado da linha bloqueada (regra dos hooks).
  const { aberto, mudarAberto } = useDialogoSemeado(() => {
    setPapel(papelAtual)
    setEscolhidas(vinculosIniciais(papelAtual))
  })

  const erroCargo = validarVinculosDoPapel(papel, escolhidas)

  // F22 — linha bloqueada (conta de Desenvolvedor vista por quem não é dev): nem o diálogo
  // se monta. O `title` nativo não serve aqui — ele não abre por foco de teclado e o botão
  // desabilitado não recebe evento de mouse (`disabled:pointer-events-none`), então a
  // explicação simplesmente não existiria. `Dica` põe a mesma frase num alvo focável.
  if (bloqueio) {
    return (
      <Dica texto={bloqueio} className="inline-flex">
        <Button variant="outline" size="sm" className="min-h-10 gap-1.5 sm:min-h-0" disabled>
          <Pencil className="size-3.5" />
          Editar
        </Button>
      </Dica>
    )
  }

  function trocarPapel(p: PapelUsuario) {
    setPapel(p)
    // Voltar ao cargo original recupera os vínculos gravados; PROMOVER/REBAIXAR para outro
    // cargo zera — inclusive ao virar Operador, para o admin escolher as filiais de propósito
    // em vez de herdar em silêncio a lista do backfill.
    setEscolhidas(vinculosIniciais(p))
  }

  function salvar() {
    if (erroCargo || salvando) return
    start(async () => {
      // Sem o catch, um throw de rede sobe pelo startTransition e apaga a tela no error
      // boundary (F19) — o admin não saberia se o cargo mudou.
      try {
        const res = await editarUsuario({ usuarioId, papel, filiais: escolhidas })
        if (!res.ok) {
          toast.error(res.erro)
          return
        }
        if (res.aviso) toast.warning(res.aviso, { duration: 12000 })
        else toast.success('Cargo e filiais atualizados.')
        mudarAberto(false)
        router.refresh()
      } catch {
        toast.error(
          'Não foi possível salvar as alterações — nada foi mudado. Verifique sua conexão e tente de novo.',
        )
      }
    })
  }

  return (
    <Dialog open={aberto} onOpenChange={mudarAberto}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="min-h-10 gap-1.5 sm:min-h-0"
          disabled={eVoceMesmo}
          title={eVoceMesmo ? 'Você não pode alterar o seu próprio cargo.' : undefined}
        >
          <Pencil className="size-3.5" />
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cargo e filiais de escrita</DialogTitle>
          <DialogDescription>
            {nome}. A mudança vale no <strong>próximo carregamento de página</strong> desta
            pessoa — não é preciso pedir que ela saia e entre de novo.
          </DialogDescription>
        </DialogHeader>

        <CargoEFiliais
          papel={papel}
          onPapelChange={trocarPapel}
          filiais={escolhidas}
          onFiliaisChange={setEscolhidas}
          opcoes={filiais}
          autorEDev={autorEDev}
          desabilitado={salvando}
          erro={erroCargo}
        />

        <DialogFooter>
          <Button variant="ghost" onClick={() => mudarAberto(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando || !!erroCargo}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

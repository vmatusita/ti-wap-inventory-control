'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  buscarColaboradoresDoCampo,
  type SugestoesColaborador,
} from '@/lib/actions/movimentacoes'
import { criarColaboradorInline } from '@/lib/actions/colaboradores'

// F37/A.4 — o campo de colaborador do fluxo, agora apoiado no CADASTRO de pessoas.
//
// O QUE MUDA: a lista passa a trazer os cadastros primeiro (marcados como tal) e o
// histórico depois; e, quando o nome digitado não tem cadastro, aparece um botão
// "Cadastrar" que cria a pessoa ali mesmo — o molde de criação inline que a F10
// validou no combobox de itens.
//
// O QUE **NÃO** MUDA, e é o ponto (ordem F37 §A.4):
//
//   · continua sendo `<input>` + `<datalist>` NATIVO, a decisão §2 da F10. Trocar por
//     Popover/Command aqui mexeria no Enter do wizard — que tem história: aceitar a
//     sugestão com Enter no Chrome dispara o keydown da página e pularia direto para
//     a Revisão. O `veioDoDatalist` abaixo existe por causa disso, e é regressão
//     conhecida (F10 sobre F9). Não se mexe no que já custou caro sem precisar.
//   · TEXTO LIVRE continua valendo e NUNCA bloqueia. Quem digita um nome que não está
//     no cadastro salva a movimentação do mesmo jeito — o servidor grava o texto e
//     deixa o vínculo nulo, e a tela de consolidação pega isso depois.
//   · o valor continua sendo uma STRING pura no `Config` do wizard. Nenhum id viaja
//     pelo formulário, pelo rascunho do `sessionStorage`, pelo "repetir última", pelo
//     kit ou pelo resumo de revisão — o vínculo é resolvido no SERVIDOR, pela chave
//     normalizada do próprio texto, na hora do INSERT. É por isso que nenhum teste
//     desses fluxos precisou ser tocado.
//
// Debounce de 300ms e mínimo de 2 caracteres, iguais aos do `campo-sugerido.tsx`.

const VAZIO: SugestoesColaborador = {
  cadastrados: [],
  historico: [],
  jaCadastrado: false,
}

export function CampoColaborador({
  id,
  rotulo,
  valor,
  onChange,
  placeholder,
  filialId = null,
  podeCadastrar = true,
}: {
  id: string
  rotulo: string
  valor: string
  onChange: (v: string) => void
  placeholder?: string
  /** Filial que o cadastro novo herda. Atributo da pessoa — não manda em permissão. */
  filialId?: number | null
  /** `false` para o cargo consulta, que não escreve nada. */
  podeCadastrar?: boolean
}) {
  const [sug, setSug] = useState<SugestoesColaborador>(VAZIO)
  const [salvando, iniciar] = useTransition()
  const listaId = `${id}-sugestoes`
  const veioDoDatalist = useRef(false)

  useEffect(() => {
    const q = valor.trim()
    let vivo = true
    const t = setTimeout(
      async () => {
        if (q.length < 2) {
          if (vivo) setSug(VAZIO)
          return
        }
        try {
          const res = await buscarColaboradoresDoCampo(q)
          if (vivo) setSug(res)
        } catch {
          // Mesma degradação calada do campo-sugerido.tsx: um toast por tecla seria
          // pior que o silêncio, e o campo continua aceitando o que for digitado.
          if (vivo) setSug(VAZIO)
        }
      },
      q.length < 2 ? 0 : 300,
    )
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [valor])

  const nome = valor.trim()
  const ofereceCadastro = podeCadastrar && nome.length >= 2 && !sug.jaCadastrado

  function cadastrar() {
    iniciar(async () => {
      try {
        const res = await criarColaboradorInline({ nome, filial_id: filialId })
        if (!res.ok) {
          toast.error(res.erro ?? 'Não foi possível cadastrar o colaborador.')
          return
        }
        // O nome CANÔNICO do cadastro volta para o campo: é ele que será gravado no
        // texto da movimentação, e assim as duas colunas contam a mesma história.
        if (res.nome) onChange(res.nome)
        setSug((s) => ({ ...s, jaCadastrado: true }))
        if (res.precisaAdminParaReativar) {
          // A pessoa EXISTE e continua desativada: quem clicou não tem permissão de
          // reativar (isso é de administrador). A movimentação sai vinculada do
          // mesmo jeito — o que a frase não pode fazer é anunciar uma reativação
          // que não aconteceu.
          toast.info(
            `${res.nome} já está no cadastro, mas desativado. A movimentação sai vinculada a ela; peça a um administrador para reativá-la em Administração → Colaboradores.`,
          )
          return
        }
        toast.success(
          res.reativado
            ? `${res.nome} voltou ao cadastro de colaboradores.`
            : `${res.nome} entrou no cadastro de colaboradores.`,
        )
      } catch {
        // F19 — sem o catch, o throw dentro do startTransition some no error boundary.
        toast.error('Não foi possível cadastrar o colaborador agora. Tente de novo.')
      }
    })
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{rotulo}</Label>
      <Input
        id={id}
        list={listaId}
        autoComplete="off"
        value={valor}
        onChange={(e) => {
          const nativo = e.nativeEvent as Partial<InputEvent>
          veioDoDatalist.current = nativo.inputType === 'insertReplacementText'
          onChange(e.target.value)
        }}
        // Engole SÓ o Enter que fecha o popup do datalist (ver o comentário longo em
        // campo-sugerido.tsx): sem isto, aceitar a sugestão pularia para a Revisão.
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          if (!veioDoDatalist.current) return
          veioDoDatalist.current = false
          e.stopPropagation()
        }}
        placeholder={placeholder}
      />
      <datalist id={listaId}>
        {sug.cadastrados.map((s) => (
          <option key={`c-${s}`} value={s} label="cadastrado" />
        ))}
        {sug.historico.map((s) => (
          <option key={`h-${s}`} value={s} />
        ))}
      </datalist>

      {ofereceCadastro && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={cadastrar}
            disabled={salvando}
          >
            <UserPlus aria-hidden="true" />
            {salvando ? 'Cadastrando…' : `Cadastrar “${nome}”`}
          </Button>
          <span className="text-xs text-muted-foreground">
            Opcional — pode registrar a movimentação assim mesmo.
          </span>
        </div>
      )}
    </div>
  )
}

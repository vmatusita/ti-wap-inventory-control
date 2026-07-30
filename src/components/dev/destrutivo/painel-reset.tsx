'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DialogoDestrutivo } from '@/components/dev/destrutivo/dialogo-destrutivo'
import { calcularPreviaReset, resetarBloco } from '@/lib/actions/dev-destrutivo'
import type { PreviaReset } from '@/lib/queries/dev-destrutivo'

type Filial = { id: number; nome: string; ativo: boolean }

const GLOBAL = 'global'

// Painel do RESET em bloco (F23 §3).
//
// ⚠ A PRÉVIA É OBRIGATÓRIA ANTES DA CONFIRMAÇÃO, e não é só ergonomia: as RPCs de reset
// exigem as contagens e RECUSAM se elas não baterem com o estado no instante do apply (guarda
// TOCTOU herdada do import). A prévia vem da RPC `previa_reset`, que conta com as MESMAS
// expressões — por isso o objeto `contagens` é devolvido intacto, sem ser remontado aqui.
//
// ⚠ O TEXTO DIZ O QUE O RECORTE FAZ DE VERDADE. Resetar uma filial apaga os ATIVOS DELA e o
// rastro inteiro deles — inclusive movimentações que foram registradas em OUTRA filial, quando
// o ativo veio transferido de lá. E NÃO apaga movimentações registradas nesta filial cujo
// ativo já migrou para outra. É o mesmo recorte do "Substituir tudo" do import; prometer "não
// vaza" seria mentira, então a tela promete o que é verificável: nenhum ATIVO de outra filial
// é apagado.
export function PainelReset({ filiais }: { filiais: Filial[] }) {
  const [bloco, setBloco] = useState<'acervo' | 'itens'>('acervo')
  const [alcance, setAlcance] = useState<string>('')
  const [previa, setPrevia] = useState<PreviaReset | null>(null)
  const [calculando, startPrevia] = useTransition()
  const [aberto, setAberto] = useState(false)

  const filiaisAtivas = filiais.filter((f) => f.ativo)
  const filialId = alcance === GLOBAL ? null : alcance === '' ? undefined : Number(alcance)

  function calcular() {
    if (filialId === undefined) {
      toast.error('Escolha o alcance: uma filial ou o sistema inteiro.')
      return
    }
    startPrevia(async () => {
      const res = await calcularPreviaReset({ bloco, filialId })
      if (!res.ok) {
        toast.error(res.erro)
        return
      }
      setPrevia(res.dados ?? null)
    })
  }

  // Trocar bloco/alcance invalida a prévia: confirmar com a contagem de OUTRO recorte seria
  // exatamente o erro que a guarda de contagens existe para pegar.
  function trocarBloco(v: string) {
    setBloco(v as 'acervo' | 'itens')
    setPrevia(null)
  }
  function trocarAlcance(v: string) {
    setAlcance(v)
    setPrevia(null)
  }

  const contagens = previa?.contagens ?? {}
  const totalAlvo = Object.values(contagens).reduce((a, b) => a + (b ?? 0), 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-44 space-y-2">
          <Label htmlFor="reset-bloco">O que apagar</Label>
          <Select value={bloco} onValueChange={trocarBloco}>
            <SelectTrigger id="reset-bloco">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="acervo">Acervo (ativos e histórico)</SelectItem>
              <SelectItem value="itens">Lançamentos de itens</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-52 space-y-2">
          <Label htmlFor="reset-alcance">Alcance</Label>
          <Select value={alcance} onValueChange={trocarAlcance}>
            <SelectTrigger id="reset-alcance">
              <SelectValue placeholder="Escolha o alcance" />
            </SelectTrigger>
            <SelectContent>
              {filiaisAtivas.map((f) => (
                <SelectItem key={f.id} value={String(f.id)}>
                  {f.nome}
                </SelectItem>
              ))}
              <SelectItem value={GLOBAL}>O sistema inteiro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button type="button" variant="secondary" onClick={calcular} disabled={calculando}>
          {calculando ? 'Contando…' : 'Ver o que seria apagado'}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {bloco === 'acervo' ? (
          <>
            Apaga os <strong>ativos do alcance</strong> e o rastro inteiro deles (movimentações,
            anotações, pendências de item e termos, com os arquivos .docx). O catálogo de itens,
            os motivos, as filiais, os kits, as senhas e os usuários <strong>ficam</strong>, e
            os relatórios já gerados também.
          </>
        ) : (
          <>
            Apaga os <strong>lançamentos</strong> de itens por quantidade do alcance — e, com
            eles, o saldo. O <strong>catálogo de itens continua</strong> intacto.
          </>
        )}
      </p>

      {previa && (
        <div className="space-y-3 rounded-md border p-4">
          <p className="text-sm font-medium">
            Seria apagado agora, em <span className="font-mono">{previa.rotulo}</span>:
          </p>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {Object.entries(contagens).map(([chave, valor]) => (
              <li key={chave} className="flex justify-between gap-4 tabular-nums">
                <span className="text-muted-foreground">{chave.replace(/_/g, ' ')}</span>
                <strong>{valor}</strong>
              </li>
            ))}
          </ul>

          {previa.termo_misto_bloqueia && (
            <p className="rounded border border-amber-500/40 bg-amber-500/5 p-2 text-sm">
              Existe <strong>termo de lote misturando esta filial com outra</strong>. O reset
              vai ser recusado — apagar metade de um termo destruiria um documento de outra
              filial. Resolva os termos antes.
            </p>
          )}

          {bloco === 'acervo' && previa.filial_id !== null && (
            <p className="text-xs text-muted-foreground">
              O recorte é <strong>pelo ativo</strong>: leva o histórico inteiro de cada ativo
              desta filial, inclusive movimentações que foram registradas em outra filial antes
              de ele ser transferido para cá — e <strong>não</strong> leva movimentações
              registradas aqui cujo ativo já foi para outra filial. Nenhum <em>ativo</em> de
              outra filial é apagado.
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            Um <strong>backup em JSON</strong> de tudo isso é gravado no armazenamento antes de
            qualquer exclusão. Sem ele, o banco recusa a operação.
          </p>

          <Button
            type="button"
            variant="destructive"
            disabled={totalAlvo === 0 || previa.termo_misto_bloqueia}
            onClick={() => setAberto(true)}
          >
            {totalAlvo === 0 ? 'Não há nada a apagar' : 'Resetar…'}
          </Button>
        </div>
      )}

      {previa && aberto && (
        <DialogoDestrutivo
          open
          onOpenChange={setAberto}
          titulo={
            previa.filial_id === null
              ? `Resetar ${bloco === 'acervo' ? 'o acervo' : 'os lançamentos'} do SISTEMA INTEIRO?`
              : `Resetar ${bloco === 'acervo' ? 'o acervo' : 'os lançamentos'} de ${previa.rotulo}?`
          }
          descricao={
            <>
              Esta ação <strong>não tem volta</strong> — o que garante a recuperação é o backup
              em JSON, gravado antes da exclusão.
            </>
          }
          esperado={previa.rotulo}
          rotuloBotao="Resetar"
          mensagemSucesso="Reset concluído."
          onConfirmar={async (confirmacao, justificativa) => {
            const res = await resetarBloco({
              bloco,
              filialId: previa.filial_id,
              confirmacao,
              justificativa,
            })
            if (res.ok) setPrevia(null)
            return res
          }}
        >
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              Some(m):{' '}
              {Object.entries(contagens)
                .map(([k, v]) => `${v} ${k.replace(/_/g, ' ')}`)
                .join(' · ')}
              .
            </li>
            <li>
              <strong>Nada é recriado.</strong> O alcance fica vazio, pronto para um import de
              startup ou para uso manual.
            </li>
            <li>
              Continuam intactos: filiais, motivos, catálogo de itens, kits, senhas de acesso,
              usuários, relatórios já gerados, a trilha de auditoria e o histórico de imports.
            </li>
          </ul>
        </DialogoDestrutivo>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DialogoDestrutivo } from '@/components/dev/destrutivo/dialogo-destrutivo'
import { apagarItem, forcarSaldo } from '@/lib/actions/dev-destrutivo'
import type { CandidatoItem } from '@/lib/queries/dev-destrutivo'

type Filial = { id: number; nome: string; ativo: boolean }

// Painel de ITENS na Zona destrutiva (F23).
//
// ⚠ A DIFERENÇA ENTRE ISTO E O QUE O ADMIN JÁ TEM: em /admin/itens, excluir um item é
// RECUSADO quando existe qualquer lançamento (a tela oferece desativar). Esta é exatamente a
// versão que não recusa — é a fronteira entre o cargo admin e o cargo dev nesta tabela.
//
// ⚠ O SALDO NÃO É UMA COLUNA. Ele é derivado da soma dos lançamentos, então "forçar o saldo"
// grava o lançamento de ajuste que leva a soma ao alvo — nunca escreve um número. E apagar o
// item apaga o saldo por construção, sem passo extra.
export function PainelItens({
  itens,
  filiais,
}: {
  itens: CandidatoItem[]
  filiais: Filial[]
}) {
  const [dialogo, setDialogo] = useState<
    { tipo: 'apagar'; item: CandidatoItem } | { tipo: 'saldo'; item: CandidatoItem } | null
  >(null)
  const [filialId, setFilialId] = useState<string>('')
  const [saldoAlvo, setSaldoAlvo] = useState<string>('')

  const filiaisAtivas = filiais.filter((f) => f.ativo)
  const alvoNumerico = Number(saldoAlvo)
  const saldoValido =
    saldoAlvo.trim() !== '' && Number.isInteger(alvoNumerico) && alvoNumerico >= 0
  const nomeFilial = filiaisAtivas.find((f) => String(f.id) === filialId)?.nome ?? ''

  if (itens.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        O catálogo de itens está vazio — não há nada a apagar nem saldo a corrigir.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y rounded-md border">
        {itens.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
            <span className="font-medium">{i.nome}</span>
            <span className="text-muted-foreground">{i.grupo}</span>
            {!i.ativo && <Badge variant="outline">desativado</Badge>}
            <span className="text-muted-foreground tabular-nums">
              {i.lancamentos} lançamento(s)
            </span>
            <div className="ml-auto flex gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setFilialId('')
                  setSaldoAlvo('')
                  setDialogo({ tipo: 'saldo', item: i })
                }}
              >
                Forçar saldo
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => setDialogo({ tipo: 'apagar', item: i })}
              >
                Apagar
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {dialogo?.tipo === 'apagar' && (
        <DialogoDestrutivo
          open
          onOpenChange={(o) => !o && setDialogo(null)}
          titulo={`Apagar o item "${dialogo.item.nome}"?`}
          esperado={dialogo.item.nome}
          rotuloBotao="Apagar item"
          mensagemSucesso="Item apagado."
          onConfirmar={async (confirmacao, justificativa) =>
            apagarItem({ itemId: dialogo.item.id, confirmacao, justificativa })
          }
        >
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              Somem junto <strong>{dialogo.item.lancamentos} lançamento(s)</strong> — e, com
              eles, o saldo do item <strong>em todas as filiais</strong>, porque o saldo é a
              soma dos lançamentos e não existe guardado em lugar nenhum.
            </li>
            <li>
              As <strong>pendências de item</strong> das devoluções não são afetadas: elas
              registram o que faltou num equipamento, em texto livre, e não apontam para o
              catálogo.
            </li>
            <li>
              Se a intenção é só tirar da lista de escolha, o caminho reversível é{' '}
              <strong>desativar</strong> em Administração › Itens.
            </li>
          </ul>
        </DialogoDestrutivo>
      )}

      {dialogo?.tipo === 'saldo' && (
        <DialogoDestrutivo
          open
          onOpenChange={(o) => !o && setDialogo(null)}
          titulo={`Forçar o saldo de "${dialogo.item.nome}"`}
          descricao={
            <>
              Grava o <strong>lançamento de ajuste</strong> que leva o total ao valor desejado.
              O saldo continua sendo a soma dos lançamentos.
            </>
          }
          esperado={dialogo.item.nome}
          rotuloBotao="Forçar saldo"
          mensagemSucesso="Saldo ajustado."
          onConfirmar={async (_confirmacao, justificativa) => {
            if (!filialId) return { ok: false as const, erro: 'Escolha a filial.' }
            if (!saldoValido) {
              return { ok: false as const, erro: 'Informe um saldo alvo inteiro e não negativo.' }
            }
            return forcarSaldo({
              itemId: dialogo.item.id,
              filialId: Number(filialId),
              saldoAlvo: alvoNumerico,
              justificativa,
            })
          }}
        >
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="saldo-filial">Filial</Label>
              <Select value={filialId} onValueChange={setFilialId}>
                <SelectTrigger id="saldo-filial">
                  <SelectValue placeholder="Escolha a filial" />
                </SelectTrigger>
                <SelectContent>
                  {filiaisAtivas.map((f) => (
                    <SelectItem key={f.id} value={String(f.id)}>
                      {f.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="saldo-alvo">Saldo total desejado nesta filial</Label>
              <Input
                id="saldo-alvo"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={saldoAlvo}
                onChange={(e) => setSaldoAlvo(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Se o alvo for menor do que já está reservado ou liberado em chamados, a
                operação é recusada — o pedido é que seria incoerente, não o sistema.
              </p>
            </div>
            {nomeFilial && saldoValido && (
              <p className="text-sm">
                Ajustar <strong>{dialogo.item.nome}</strong> em <strong>{nomeFilial}</strong>{' '}
                para <strong>{alvoNumerico}</strong>.
              </p>
            )}
          </div>
        </DialogoDestrutivo>
      )}
    </div>
  )
}

'use client'

import { useId } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PAPEIS, PAPEL_DESCRICAO, PAPEL_ROTULO, exigeVinculoDeFilial } from '@/lib/auth/papeis'
import type { PapelUsuario } from '@/lib/auth/papeis'

export type FilialOpcao = { id: number; nome: string }

// Trecho de formulário compartilhado pelo convite e pela edição de usuário (F21): escolher o
// CARGO e, quando o cargo é Operador, as FILIAIS DE ESCRITA.
//
// A regra "mínimo 1 filial para Operador" não é redigitada aqui: sai de
// `validarVinculosDoPapel` (src/lib/auth/papeis.ts), a mesma função que o schema Zod do
// servidor usa. O cliente só antecipa a mensagem; quem decide é a action.
export function CargoEFiliais({
  papel,
  onPapelChange,
  filiais,
  onFiliaisChange,
  opcoes,
  desabilitado,
  erro,
}: {
  papel: PapelUsuario
  onPapelChange: (p: PapelUsuario) => void
  filiais: number[]
  onFiliaisChange: (ids: number[]) => void
  /**
   * As filiais que este formulário pode oferecer. No CONVITE são só as ativas (ninguém
   * movimenta em filial desativada). Na EDIÇÃO, a tabela acrescenta as inativas em que o
   * usuário JÁ tem vínculo, com o sufixo "(inativa)" no nome — senão salvar apagaria esse
   * vínculo em silêncio, porque a action apaga-e-regrava a lista recebida.
   */
  opcoes: readonly FilialOpcao[]
  desabilitado?: boolean
  /** Mensagem de erro do formulário (a regra do cargo × filiais). */
  erro?: string | null
}) {
  const idCargo = useId()
  const mostrarFiliais = exigeVinculoDeFilial(papel)

  function alternar(id: number, marcado: boolean) {
    onFiliaisChange(
      marcado ? [...new Set([...filiais, id])] : filiais.filter((f) => f !== id),
    )
  }

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={idCargo}>Cargo</Label>
        <Select
          value={papel}
          onValueChange={(v) => onPapelChange(v as PapelUsuario)}
          disabled={desabilitado}
        >
          <SelectTrigger id={idCargo} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAPEIS.map((p) => (
              <SelectItem key={p} value={p}>
                {PAPEL_ROTULO[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{PAPEL_DESCRICAO[papel]}</p>
      </div>

      {mostrarFiliais && (
        <fieldset className="space-y-2" disabled={desabilitado}>
          <legend className="text-sm font-medium">Filiais de escrita</legend>
          <p className="text-xs text-muted-foreground">
            O operador <strong>vê</strong> todas as filiais; só <strong>registra</strong>{' '}
            movimentações, itens, termos e correções nas filiais marcadas aqui.
          </p>
          <div className="grid gap-1 sm:grid-cols-2">
            {opcoes.map((f) => (
              <label
                key={f.id}
                className="flex min-h-10 items-center gap-2 text-sm sm:min-h-0"
              >
                <Checkbox
                  checked={filiais.includes(f.id)}
                  onCheckedChange={(c) => alternar(f.id, c === true)}
                  disabled={desabilitado}
                />
                {f.nome}
              </label>
            ))}
          </div>
          {opcoes.length === 0 && (
            <p className="text-xs text-destructive">
              Nenhuma filial ativa cadastrada — cadastre uma em Administração › Filiais
              antes de criar um operador.
            </p>
          )}
        </fieldset>
      )}

      {erro && <p className="text-xs text-destructive">{erro}</p>}
    </>
  )
}

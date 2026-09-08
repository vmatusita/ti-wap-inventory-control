'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AvisoSemFilialDeEscrita } from '@/components/layout/aviso-sem-escrita'
import { CampoColaborador } from '@/components/movimentacoes/nova/campo-colaborador'
import { hojeISO } from '@/lib/format'
import type { TipoLancamento } from '@/lib/dominio'
import type { Filial } from '@/lib/queries/filiais'

// OS CAMPOS COMUNS DO LANÇAMENTO — filial, data, chamado, colaborador e
// observação (F42 · frente C).
//
// São os campos que valem para o CARRINHO INTEIRO, e não por linha: um lote de
// itens é sempre da mesma filial, na mesma data, com o mesmo chamado e a mesma
// pessoa. Estavam soltos no meio das 893 linhas do diálogo, entre a escolha do
// tipo e o rodapé; aqui viram um bloco com nome.
//
// Estado NENHUM mora aqui. Todo valor e todo setter chegam por prop, porque o
// diálogo precisa deles em `salvar()`, em `limpar()` e em `repetirUltimo()`.

export function LancarItemCampos({
  filiais,
  filialId,
  data,
  chamado,
  colaborador,
  observacao,
  tipo,
  precisaChamado,
  exigeObs,
  rotuloColaborador,
  onFilial,
  onData,
  onChamado,
  onColaborador,
  onObservacao,
}: {
  /** Já recortado às filiais em que este cargo ESCREVE (F21). */
  filiais: Filial[]
  filialId: number | null
  data: string
  chamado: string
  colaborador: string
  observacao: string
  tipo: TipoLancamento | null
  /** `exigeChamado(tipo)` — a regra vem do validator, fonte única com o servidor. */
  precisaChamado: boolean
  /** Ajuste: a justificativa é obrigatória (CHECK `lanc_item_ajuste_obs`). */
  exigeObs: boolean
  /** O rótulo do campo de pessoa muda com o tipo ("quem levou" × "quem devolveu"). */
  rotuloColaborador: string
  onFilial: (id: number) => void
  onData: (v: string) => void
  onChamado: (v: string) => void
  onColaborador: (v: string) => void
  onObservacao: (v: string) => void
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          {/* F19 — o rótulo se liga ao gatilho por htmlFor/id (P1-2): sem isso o
              Select só se anunciava pelo valor corrente. */}
          <Label htmlFor="lanc-filial">Filial</Label>
          {filiais.length === 0 ? (
            <AvisoSemFilialDeEscrita />
          ) : (
            <Select
              value={filialId ? String(filialId) : ''}
              onValueChange={(v) => onFilial(Number(v))}
            >
              <SelectTrigger id="lanc-filial" className="w-full">
                <SelectValue placeholder="Filial" />
              </SelectTrigger>
              <SelectContent>
                {filiais.map((f) => (
                  <SelectItem key={f.id} value={String(f.id)}>
                    {f.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lanc-data">Data</Label>
          <Input
            id="lanc-data"
            type="date"
            max={hojeISO()}
            value={data}
            onChange={(e) => onData(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          {/* A ausência de "(opcional)" é a convenção que marca campo obrigatório
              neste diálogo (achado 9 da revisão de 19/08/2026). */}
          <Label htmlFor="lanc-chamado">Chamado{precisaChamado ? '' : ' (opcional)'}</Label>
          <Input
            id="lanc-chamado"
            inputMode="numeric"
            value={chamado}
            onChange={(e) => onChamado(e.target.value)}
            // F42 — o placeholder deixou de ramificar em `tipo === 'liberacao'`.
            // Aquele ramo dizia "o mesmo chamado da Reserva", porque a Devolução de
            // reserva era a AMARRA que fechava o par no banco. A F41 tirou o par
            // reserva/liberação da tela (decisão J1): `TIPOS_OFERECIDOS` não o
            // inclui, `definirTipo` só aceita de lá, e o ramo ficou inalcançável.
            placeholder="nº do chamado"
          />
        </div>
        <div className="space-y-1.5">
          {/* F37/A.4 — o campo oferece o cadastro de pessoas e a criação inline,
              igual ao wizard de movimentação. Antes era um <Input> cru, sem sugestão
              nenhuma: dos dois lugares onde se digita colaborador, este era o mais
              exposto a grafia divergente. O rótulo continua dinâmico por tipo e
              continua trazendo "(opcional)" — é texto livre, e nunca bloqueia. */}
          <CampoColaborador
            id="lanc-colab"
            rotulo={rotuloColaborador}
            valor={colaborador}
            onChange={onColaborador}
            placeholder={tipo === 'saida' ? 'nome de quem levou' : 'a quem se destina'}
            filialId={filialId}
            // `filiais` já vem recortado às filiais em que este cargo ESCREVE (F21).
            //
            // ⚠ CORREÇÃO DE FATO (F50): o comentário anterior dizia "lista vazia =
            // cargo consulta, que não cria nada". Medido, isso está errado — o
            // `consulta` NUNCA chega até aqui, porque `itens/page.tsx` só monta o
            // diálogo dentro de `{escreve && …}`. A única forma de a lista chegar
            // vazia é OPERADOR SEM VÍNCULO, e para ele esconder o cadastro é
            // provavelmente indevido: cadastro de pessoa não é matéria de filial
            // (o `filial_id` é atributo, não escopo de escrita).
            //
            // Derivar permissão do COMPRIMENTO de uma lista é o padrão que
            // `lib/auth/papeis.ts:173` proíbe por escrito, e os dois campos irmãos
            // (`passo-movimentacao.tsx`, `secao-contrapartida.tsx`) já perguntam
            // `papel !== 'consulta'`. Trocar aqui MUDARIA o que essa pessoa vê, então
            // não é desta fase: fica registrado como exceção nominal em
            // `components/layout/permissoes.test.ts` e nomeado para a F70.
            podeCadastrar={filiais.length > 0}
          />
          {tipo === 'saida' && !colaborador.trim() && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Sem o nome, o histórico não dirá com quem o item está.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="lanc-obs">
          Observação{exigeObs ? ' (justificativa do ajuste)' : ' (opcional)'}
        </Label>
        <Textarea
          id="lanc-obs"
          value={observacao}
          onChange={(e) => onObservacao(e.target.value)}
          rows={2}
          placeholder={exigeObs ? 'Por que o ajuste?' : ''}
        />
      </div>
    </>
  )
}

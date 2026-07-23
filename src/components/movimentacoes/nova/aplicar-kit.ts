// Decisão pura de "aplicar kit" no passo 2 da nova movimentação (F12 · M12).
// Sem React: a regra é a mesma que o handler do form executa e a que os testes
// exercitam — duas cópias divergiriam no primeiro tipo novo do enum.
//
// O kit é um MODELO da configuração do lote (tipo, motivo, termo, observação).
// Aplicar não valida nada de negócio: o formulário continua passando pelos
// validadores de movimentação (e a máquina de estados no Postgres é a fonte da
// verdade). O que esta função decide é apenas o que vai para a `Config`.
import type { Config } from '@/components/movimentacoes/nova/config'
import type { TipoMovimentacao } from '@/lib/dominio'
import type { KitPayload } from '@/lib/validators/kit'

export type DecisaoKit =
  | {
      // Tipo do kit fora da interseção de tipos válida para os ativos do lote.
      // NADA é aplicado (decisão OS-F12 §W3.2, deliberadamente diferente do
      // `repetirUltima`, que aplica o resto e só não troca o tipo): o kit é um
      // conjunto coerente — meio kit aplicado é pior que kit nenhum, porque o
      // operador acha que preencheu e o tipo continua o de antes.
      aplicar: false
      tipoKit: TipoMovimentacao
    }
  | {
      aplicar: true
      config: Config
      // O tipo mudou de verdade → o form limpa o `statusResultante` (estado
      // fora da Config), exatamente como o `trocarTipo` faz.
      trocouTipo: boolean
      // O kit trazia um motivo que não se aplica mais ao tipo (motivo desativado
      // em /admin/motivos depois que o kit foi salvo, ou fora do `aplica_a`).
      // O motivo foi LIMPO — a UI avisa em vez de gravar um código impossível.
      motivoDescartado: boolean
    }

export function decidirAplicacaoKit({
  payload,
  config,
  tiposValidos,
  motivosDoTipo,
}: {
  payload: KitPayload
  config: Config
  // Interseção de tipos válida para os ativos do lote (`tiposDoLote`).
  tiposValidos: readonly TipoMovimentacao[]
  // Códigos de motivo ATIVOS que se aplicam ao tipo DO KIT (o mesmo filtro
  // `aplica_a.includes(tipo)` do form e do kit-dialog).
  motivosDoTipo: readonly string[]
}): DecisaoKit {
  if (!tiposValidos.includes(payload.tipo)) {
    return { aplicar: false, tipoKit: payload.tipo }
  }

  const trocouTipo = config.tipo !== payload.tipo
  const motivoDoKit = payload.motivo ?? ''
  const motivoAplicavel = motivoDoKit !== '' && motivosDoTipo.includes(motivoDoKit)

  return {
    aplicar: true,
    trocouTipo,
    motivoDescartado: motivoDoKit !== '' && !motivoAplicavel,
    config: {
      ...config,
      tipo: payload.tipo,
      // Os quatro campos do kit sobrescrevem SEMPRE — inclusive para vazio.
      // Aplicar o mesmo kit duas vezes tem de dar o mesmo resultado; se o campo
      // ausente no kit fosse "preservar", o form guardaria resto do preenchimento
      // anterior sem ninguém ver (mesma doutrina do `repetirUltima`, que também
      // escreve '' quando a última movimentação não tinha o campo).
      motivo: motivoAplicavel ? motivoDoKit : '',
      termo: payload.termo ?? '',
      observacao: payload.observacao ?? '',
      // Campos condicionais do tipo ANTERIOR: some com eles quando o tipo muda
      // (mesma limpeza do `trocarTipo` — senão a filial de destino de uma
      // transferência vaza para uma saída). Tipo igual = o operador não perde o
      // que já preencheu: o kit não carrega nenhum dos dois.
      filialDestinoId: trocouTipo ? '' : config.filialDestinoId,
      itensFaltantes: trocouTipo ? [] : config.itensFaltantes,
    },
  }
}

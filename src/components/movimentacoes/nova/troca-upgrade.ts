// F26 — o facilitador do PAR troca/upgrade em funcoes PURAS (sem React, como
// `config.ts` e `aplicar-kit.ts`). Trocar o equipamento de alguem e UMA operacao
// do mundo real que sempre valeu DUAS movimentacoes: a devolucao do antigo e a
// saida do novo, as duas com motivo `troca_upgrade`. Toda a regra do par mora
// aqui — o wizard so desenha e o servidor nao mudou (a action de lote ja aceita
// itens heterogeneos).
//
// VOCABULARIO (duas coisas diferentes com nome parecido):
//   `troca`          = TIPO de movimentacao (F15) — o nascimento do substituto
//                      vindo do FORNECEDOR, gravado so pela RPC
//                      `devolver_ao_fornecedor`, fora do formulario manual.
//   `troca_upgrade`  = MOTIVO de saida/devolucao entre colaboradores e o
//                      estoque. Este modulo e 100% sobre o MOTIVO.
import {
  MAX_LOTE_MOVIMENTACAO,
  tiposManuaisPara,
} from '@/lib/validators/movimentacao'
import {
  rotuloPatrimonio,
  rotuloStatus,
  rotuloTipo,
  type TermoStatus,
  type TipoMovimentacao,
} from '@/lib/dominio'
import type { AtivoResumo } from '@/lib/queries/ativos'
import {
  montarItensInput,
  type Config,
  type ContrapartidaPendente,
} from '@/components/movimentacoes/nova/config'

// O CODIGO do motivo (seed 0007, `aplica_a = {saida,devolucao}`) — FONTE UNICA.
// A deteccao do facilitador e SEMPRE por este codigo, nunca pelo rotulo: o
// admin renomeia "Troca / upgrade" em `admin/motivos` quando quiser, e o par
// tem de continuar funcionando. Se o admin DESATIVAR o motivo, ele some do
// select e o facilitador simplesmente nao dispara — comportamento correto.
export const MOTIVO_TROCA_UPGRADE = 'troca_upgrade'

// A metade oposta de cada sentido. So `saida` e `devolucao` tem contrapartida —
// e o que o seed diz (`aplica_a`). Se um dia o admin ampliar o `aplica_a` do
// motivo para outros tipos, a secao continua nao aparecendo neles, e esta certo
// assim: `emprestimo`/`reserva` nao formam par de troca.
export function tipoContrapartida(
  tipo: TipoMovimentacao | '',
): TipoMovimentacao | null {
  if (tipo === 'devolucao') return 'saida'
  if (tipo === 'saida') return 'devolucao'
  return null
}

// A secao da contrapartida aparece e some DERIVADA daqui — vale para o motivo
// escolhido a mao, por kit, por "repetir ultima" ou por "duplicar", sem caso
// especial por origem.
export function ofereceContrapartida(config: Config): boolean {
  return (
    tipoContrapartida(config.tipo) !== null &&
    config.motivo === MOTIVO_TROCA_UPGRADE
  )
}

// O estado da metade oposta. `data`, `chamado` e `observacao` NAO estao aqui:
// sao COMPARTILHADOS da Config principal (um preenchimento para o lote inteiro,
// como todo o resto do wizard). O motivo tambem nao: e sempre `troca_upgrade`,
// fixo — a UI o mostra como informacao, nunca como select.
export type ContrapartidaTroca = {
  itens: AtivoResumo[]
  // Sentido devolucao -> saida (a metade `saida` coleta colaborador/setor/termo).
  colaborador: string
  setor: string
  termo: '' | TermoStatus
  termoData: string
  // Sentido saida -> devolucao (a metade `devolucao` coleta itens faltantes).
  itensFaltantes: string[]
  // Ligado: a secao recolhe e o registrar grava so a metade principal. O PADRAO
  // e a contrapartida ABERTA (decisao do Johnny, 04/08/2026).
  deixarParaDepois: boolean
  // Esta metade JA EXISTE no banco — foi ela que abriu esta tela, pelo atalho do
  // painel de sucesso (`?contrapartida=nao`). E propriedade do PAR, nao da
  // montagem: por isso mora aqui e nao num estado solto do formulario, e o
  // rascunho a carrega junto (2a volta adversarial da F26).
  //
  // Quem decide se ela SOBREVIVE a seçao sumir e voltar e o formulario, nao este
  // modulo: `nascerContrapartida` nunca a inventa (nasce `false`), mas
  // `sincronizarContrapartida` a repoe quando o TIPO nao mudou — ir e voltar
  // pelo motivo e a mesma troca, e zerar ali reabria o laco do atalho (revisao
  // de codigo pos-F26; ata em `docs/DECISOES.md`).
  jaRegistrada: boolean
  // O ULTIMO valor que o pre-preenchimento automatico escreveu em `colaborador`.
  // Serve a uma pergunta so: "o operador digitou por cima?". Se `colaborador`
  // ainda for igual a isto, o campo e do sistema e pode ser recalculado quando o
  // lote principal muda; se divergir, e do operador e nao se toca.
  //
  // `undefined` = NAO SE SABE (rascunho gravado antes deste campo existir). Como
  // difere de QUALQUER string, o campo passa a ser tratado como do operador e o
  // prefill nunca o sobrescreve — o lado seguro. E diferente de `''`, que quer
  // dizer "o prefill ja rodou e nao tinha nome honesto para escrever".
  prefillColaborador: string | undefined
}

export function contrapartidaPadrao(
  inicial?: Partial<ContrapartidaTroca>,
): ContrapartidaTroca {
  return {
    itens: inicial?.itens ?? [],
    colaborador: inicial?.colaborador ?? '',
    setor: inicial?.setor ?? '',
    termo: inicial?.termo ?? '',
    termoData: inicial?.termoData ?? '',
    itensFaltantes: inicial?.itensFaltantes ?? [],
    deixarParaDepois: inicial?.deixarParaDepois ?? false,
    jaRegistrada: inicial?.jaRegistrada ?? false,
    // `?? ''` NAO cabe aqui: apagaria a diferenca entre "ninguem informou o
    // campo" (contrapartida nova => o prefill ainda pode rodar) e "informou
    // `undefined` de proposito" (rascunho antigo => o campo e do operador).
    // Com o `??`, o nome que o operador tinha APAGADO voltava sozinho na
    // primeira mudanca do lote — o chute silencioso que o prefill evita.
    prefillColaborador: Object.prototype.hasOwnProperty.call(
      inicial ?? {},
      'prefillColaborador',
    )
      ? inicial?.prefillColaborador
      : '',
  }
}

// Quem recebe o equipamento novo e, quase sempre, quem devolveu o antigo. O
// nome sai do LOTE EM MEMORIA e e capturado ANTES do envio: depois do insert o
// trigger `aplicar_movimentacao` zera `colaborador_atual` do devolvido.
//
// Honestidade acima de conveniencia: so pre-preenche quando TODOS os ativos da
// metade principal estao com o MESMO colaborador nao-vazio. Detentores mistos
// (ou algum sem detentor) devolvem '' — chute silencioso aqui entregaria o
// notebook novo para a pessoa errada.
export function prefillContrapartida(lotePrincipal: AtivoResumo[]): string {
  if (lotePrincipal.length === 0) return ''
  const nomes = new Set(
    lotePrincipal.map((a) => (a.colaborador_atual ?? '').trim()),
  )
  if (nomes.size !== 1) return ''
  const unico = [...nomes][0]
  return unico === '' ? '' : unico
}

// A contrapartida no momento em que a secao NASCE: vazia, com o colaborador
// pre-preenchido so no sentido devolucao -> saida (a metade `devolucao` nem
// coleta colaborador).
export function nascerContrapartida(
  config: Config,
  lotePrincipal: AtivoResumo[],
): ContrapartidaTroca {
  const alvo = tipoContrapartida(config.tipo)
  const prefill = alvo === 'saida' ? prefillContrapartida(lotePrincipal) : ''
  // `jaRegistrada` e `deixarParaDepois` ficam no padrao (false): esta funcao
  // nunca INVENTA o marcador. Se ele vale para o par que esta nascendo e decisao
  // do formulario, que conhece a tela e o tipo anterior — ver o comentario do
  // campo, e `sincronizarContrapartida`.
  return contrapartidaPadrao({
    colaborador: prefill,
    prefillColaborador: prefill,
  })
}

// O pre-preenchimento acompanha o lote principal enquanto o campo for do
// SISTEMA. Sem isto ele congelava no instante em que a secao nascia: montar a
// devolucao de um notebook do Fulano, abrir a secao (colaborador = "Fulano") e
// voltar ao passo 1 para juntar o notebook da Beltrana deixava "Fulano" escrito
// num lote de detentores MISTOS — exatamente o chute silencioso que
// `prefillContrapartida` existe para evitar.
//
// Digitou por cima (inclusive apagando)? O campo passa a ser do operador e nunca
// mais e sobrescrito.
export function sincronizarPrefill(
  config: Config,
  contrapartida: ContrapartidaTroca,
  lotePrincipal: AtivoResumo[],
): ContrapartidaTroca {
  if (!ofereceContrapartida(config)) return contrapartida
  if (tipoContrapartida(config.tipo) !== 'saida') return contrapartida
  if (contrapartida.colaborador !== contrapartida.prefillColaborador) {
    return contrapartida
  }
  const novo = prefillContrapartida(lotePrincipal)
  if (novo === contrapartida.colaborador) return contrapartida
  return { ...contrapartida, colaborador: novo, prefillColaborador: novo }
}

// A Config equivalente da metade oposta: os campos compartilhados vem da
// principal, o tipo e invertido, o motivo e fixo e os campos exclusivos saem da
// contrapartida. Passar por uma `Config` de verdade e o que permite reusar o
// `construirItem`/`montarItensInput` vigentes — quem decide o que serializa
// continua sendo `CAMPOS_POR_TIPO` (o termo cai sozinho na devolucao, os itens
// faltantes caem sozinhos na saida).
export function configDaContrapartida(
  config: Config,
  contrapartida: ContrapartidaTroca,
): Config {
  return {
    // Compartilhados com a metade principal (um preenchimento so).
    data: config.data,
    chamado: config.chamado,
    observacao: config.observacao,
    // Proprios da metade oposta.
    tipo: tipoContrapartida(config.tipo) ?? '',
    motivo: MOTIVO_TROCA_UPGRADE,
    colaborador: contrapartida.colaborador,
    setor: contrapartida.setor,
    termo: contrapartida.termo,
    termoData: contrapartida.termoData,
    itensFaltantes: contrapartida.itensFaltantes,
    // Nao existem em `saida`/`devolucao` — zerados por completude da forma.
    chamadoFornecedor: '',
    filialDestinoId: '',
  }
}

// A contrapartida esta ATIVA (a secao esta aberta e vai virar movimentacao)?
export function contrapartidaAtiva(
  config: Config,
  contrapartida: ContrapartidaTroca | null,
): boolean {
  return (
    contrapartida !== null &&
    !contrapartida.deixarParaDepois &&
    ofereceContrapartida(config)
  )
}

// Regras que SO existem por causa do par (as de cada movimentacao continuam com
// o Zod). Devolve as mensagens em pt-BR — vazio = ok.
export function validarPar(
  config: Config,
  itensPrincipal: AtivoResumo[],
  contrapartida: ContrapartidaTroca | null,
): string[] {
  if (!ofereceContrapartida(config) || !contrapartida) return []
  const alvo = tipoContrapartida(config.tipo)
  if (!alvo) return []

  const msgs: string[] = []

  // Contrapartida ABERTA e VAZIA: ou o operador escolhe o(s) equipamento(s), ou
  // diz explicitamente que fica para depois. Nao ha terceiro caminho — registrar
  // metade da troca sem querer e o defeito que este facilitador existe para
  // evitar.
  if (!contrapartida.deixarParaDepois && contrapartida.itens.length === 0) {
    msgs.push(
      `Adicione o(s) equipamento(s) da ${rotuloTipo(alvo).toLowerCase()} da troca — ou marque "Deixar a contrapartida para depois".`,
    )
    return msgs
  }

  if (contrapartida.deixarParaDepois) return msgs

  // Metades DISJUNTAS: o mesmo ativo nao pode devolver e sair no mesmo gesto.
  // (A Server Action ja recusa ativo repetido no lote — isto e o aviso claro
  // antes do envio, nao a unica barreira.)
  const idsPrincipal = new Set(itensPrincipal.map((a) => a.id))
  const repetidos = contrapartida.itens.filter((a) => idsPrincipal.has(a.id))
  for (const a of repetidos) {
    msgs.push(
      `${rotuloPatrimonio(a.patrimonio)} está nas duas metades da troca — um ativo não pode ser devolvido e entregue no mesmo registro.`,
    )
  }

  // Teto SOMADO: o `MAX_LOTE_MOVIMENTACAO` vale para o array inteiro submetido,
  // logo para a soma das metades. Mensagem derivada da constante.
  const total = itensPrincipal.length + contrapartida.itens.length
  if (total > MAX_LOTE_MOVIMENTACAO) {
    msgs.push(
      `As duas metades somam ${total} ativos e o lote aceita no máximo ${MAX_LOTE_MOVIMENTACAO}. Remova ativos de uma das metades.`,
    )
  }

  // Cada ativo da contrapartida precisa aceitar o tipo DELA (a mesma intersecao
  // de estados que guarda a metade principal, aplicada por metade).
  for (const a of contrapartida.itens) {
    if (!tiposManuaisPara([a.status]).includes(alvo)) {
      msgs.push(
        `${rotuloPatrimonio(a.patrimonio)} (${rotuloStatus(a.status)}) não permite "${rotuloTipo(alvo)}" — tire-o da ${rotuloTipo(alvo).toLowerCase()} da troca.`,
      )
    }
  }

  return [...new Set(msgs)]
}

// O painel de sucesso deve oferecer o atalho da metade que faltou?
//
// A resposta NAO e so "o operador marcou deixar para depois". A tela aberta pelo
// proprio atalho chega com esse flag LIGADO (e o que o `contrapartida=nao` faz,
// para ela nao pedir a contrapartida DA contrapartida) — e, sem `jaRegistrada`,
// ao registrar aquela metade o painel diria de novo "falta a outra metade da
// troca", apontando para a que o operador acabou de gravar. Laco, e um laco que
// mente.
export function deveOferecerAtalho(
  config: Config,
  contrapartida: ContrapartidaTroca | null,
): boolean {
  if (!ofereceContrapartida(config) || !contrapartida) return false
  if (contrapartida.jaRegistrada) return false
  return contrapartida.deixarParaDepois
}

// O link que reabre `/movimentacoes/nova` na metade que ficou para depois.
// `contrapartida=nao` recolhe o facilitador na chegada; `de=` carrega a
// movimentacao de origem e existe para a URL do atalho nunca coincidir com a URL
// atual (link igual = navegacao que nao acontece = botao mudo). Nenhuma
// pendencia e nenhum estado no servidor: e conveniencia de navegacao (decisao
// "so a tela").
export function linkContrapartida(pendente: ContrapartidaPendente): string {
  const params = new URLSearchParams({
    tipo: pendente.tipo,
    motivo: MOTIVO_TROCA_UPGRADE,
    contrapartida: 'nao',
  })
  if (pendente.colaborador) params.set('colaborador', pendente.colaborador)
  // O `setor` viaja junto: o Zod da saida aceita colaborador OU setor, e a troca
  // destinada a um SETOR (sem pessoa nomeada) nao pode chegar do outro lado sem
  // nada preenchido.
  if (pendente.setor) params.set('setor', pendente.setor)
  if (pendente.origemMovimentacaoId) params.set('de', pendente.origemMovimentacaoId)
  return `/movimentacoes/nova?${params.toString()}`
}

// Itens do lote inteiro: a metade PRINCIPAL primeiro, a contrapartida depois.
// A ordem importa e e decisao registrada: a Server Action interrompe no
// PRIMEIRO erro e marca o resto como "nao processado" — com a principal na
// frente, o que falha primeiro e a metade que o operador estava montando, e a
// contrapartida nunca entra sozinha por causa de um erro na principal.
export function montarItensDoPar(
  itensPrincipal: AtivoResumo[],
  config: Config,
  statusResultante: string,
  contrapartida: ContrapartidaTroca | null,
): Record<string, unknown>[] {
  const principal = montarItensInput(itensPrincipal, config, statusResultante)
  if (!contrapartidaAtiva(config, contrapartida) || !contrapartida) {
    return principal
  }
  // `statusResultante` nao se aplica: a contrapartida e sempre saida/devolucao,
  // nunca `ajuste`.
  const oposta = montarItensInput(
    contrapartida.itens,
    configDaContrapartida(config, contrapartida),
    '',
  )
  return [...principal, ...oposta]
}

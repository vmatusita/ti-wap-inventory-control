// dono-do-termo.ts — quem já "é dono" de um termo (nome de filial OU apelido),
// pela chave normalizada (F56 · Frente E · Decisões 2 e 13 do PLAN-F56).
//
// Função PURA: não lê banco, não decide o que fazer com o resultado — só responde
// "que filial já usa este termo, e como" (nome próprio ou apelido). As duas
// frentes que escrevem no vocabulário de unidades chamam esta MESMA função ANTES
// de escrever, para dar a mensagem amigável que nomeia a filial dona:
//   · `src/lib/actions/unidades-apelidos.ts` — cadastrar/remover apelido;
//   · `src/lib/actions/admin.ts` — criar ou renomear filial.
// O BANCO (índices únicos `filiais_nome_chave_uidx`/`unidades_apelidos_apelido_
// chave_uidx` + o gatilho `vocabulario_unidades_guarda`, migration 0139) é a
// GARANTIA real; esta função é só a pré-conferência que evita a viagem e escreve
// a mensagem em TypeScript — nunca repassando texto cru do Postgres (regra de
// `src/lib/actions/erros.ts`).
//
// A CHAVE é `normalizarTexto` de `src/lib/import/deparas.ts` — o MESMO espelho
// que `public.vocabulario_chave(text)` usa no banco (Decisão 1 do PLAN-F56): NFD,
// sem diacrítico, minúsculas, um `:` final fora, espaços colapsados e aparados.
//
// TODA filial conta, ATIVA ou INATIVA (Decisão 2 — "toda filial é unidade
// conhecida"): esta função não filtra por `ativo`; quem monta a lista decide o
// que incluir, e o teste prova que uma filial inativa na lista continua sendo
// dona de um termo.

import { normalizarTexto } from '@/lib/import/deparas'

export type FilialParaTermo = { id: number; nome: string; ativo?: boolean }
export type ApelidoParaTermo = { filialId: number; apelido: string }

export type DonoDoTermo = {
  filialId: number
  nomeFilial: string
  /** `nome_proprio`: o termo É o nome da filial. `apelido`: o termo é apelido dela. */
  origem: 'nome_proprio' | 'apelido'
} | null

/** Quem já é dono do termo, pela chave normalizada — ou `null`, termo livre. */
export function encontrarDonoDoTermo(
  termo: string,
  filiais: readonly FilialParaTermo[],
  apelidos: readonly ApelidoParaTermo[],
): DonoDoTermo {
  const chave = normalizarTexto(termo)
  if (!chave) return null

  const porNome = filiais.find((f) => normalizarTexto(f.nome) === chave)
  if (porNome) {
    return { filialId: porNome.id, nomeFilial: porNome.nome, origem: 'nome_proprio' }
  }

  const porApelido = apelidos.find((a) => normalizarTexto(a.apelido) === chave)
  if (porApelido) {
    const dona = filiais.find((f) => f.id === porApelido.filialId)
    return { filialId: porApelido.filialId, nomeFilial: dona?.nome ?? '', origem: 'apelido' }
  }

  return null
}

/**
 * A mensagem para quem está CADASTRANDO UM APELIDO — nomeia a filial dona, no
 * padrão dos exemplos da ordem F56 («Serra Park» já é apelido da filial Serra…).
 * `null` = sem colisão, pode incluir.
 */
export function mensagemColisaoApelido(
  apelido: string,
  filialAlvoId: number,
  dono: DonoDoTermo,
): string | null {
  if (!dono) return null

  if (dono.origem === 'nome_proprio') {
    if (dono.filialId === filialAlvoId) {
      return 'O nome próprio desta filial já vale sempre na coluna Site — não precisa de apelido igual a ele.'
    }
    return `«${apelido}» é o nome da filial ${dono.nomeFilial}.`
  }

  // origem === 'apelido'
  if (dono.filialId === filialAlvoId) {
    return `«${apelido}» já é apelido desta filial.`
  }
  return `«${apelido}» já é apelido da filial ${dono.nomeFilial} — um termo só pode apontar para uma filial.`
}

/**
 * A mensagem para quem está CRIANDO OU RENOMEANDO UMA FILIAL. `filialAlvoId` é
 * `null` na criação (a filial ainda não tem id — nunca pode colidir consigo
 * mesma) e o id dela própria na edição. Renomear para o PRÓPRIO nome atual (só
 * caixa/acento mudou, ou nem isso) NÃO é colisão — espelha o curto-circuito do
 * gatilho `vocabulario_unidades_guarda` para UPDATE (a chave não mudou, nada a
 * conferir).
 */
export function mensagemColisaoNomeFilial(
  nome: string,
  filialAlvoId: number | null,
  dono: DonoDoTermo,
): string | null {
  if (!dono) return null

  if (dono.origem === 'nome_proprio') {
    if (dono.filialId === filialAlvoId) return null
    return `«${nome}» já é o nome da filial ${dono.nomeFilial}.`
  }

  // origem === 'apelido'
  if (dono.filialId === filialAlvoId) {
    return `«${nome}» já é apelido desta própria filial — remova o apelido antes de usá-lo como nome.`
  }
  return `«${nome}» já é apelido da filial ${dono.nomeFilial} — escolha outro nome.`
}

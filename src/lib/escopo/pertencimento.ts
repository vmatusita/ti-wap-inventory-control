// O PERTENCIMENTO DO RECURSO AO ESCOPO DE QUEM PEDE — a fechadura no-op da F54.
//
// Hoje o sistema atende UMA organização. `urlBackup` emite uma URL assinada para o
// dump de QUALQUER import, e `listarImportLogs` devolve o histórico de TODAS as
// filiais, sem recorte nenhum. Com uma empresa só isso não é defeito: é o desenho.
//
// ⚠ POR QUE ESTA É A CADEIA QUE IMPORTA, e por que arrumar o bucket não a fecha.
// A URL assinada é emitida PELO SERVIDOR, com a credencial de quem já passou por
// `exigirAdmin`. O Storage não tem como saber que aquele admin é de outra empresa —
// quando a pergunta "de quem é este backup?" existir, ela terá de ser respondida
// AQUI, no código, antes de a URL nascer. Mexer em policy de bucket não fecha isto,
// e é por isso que a F54 escolheu o ponto de injeção em vez da policy.
//
// ⚠ O QUE ESTE MÓDULO É HOJE: um NO-OP. `escopoDeGestaoAtual()` devolve sempre o
// mesmo escopo, e todo `import_logs` pertence a ele — então `pertenceAoEscopo` sempre
// responde `true`, e NADA muda para quem opera. Isso é intencional e é a regra 5 do
// §4 do plano ("no-op primeiro"): a fechadura entra inerte, com uma empresa só, e a
// F62/F69 troca o CORPO de `escopoDoImportLog` para ler o tenant da linha. Um lugar,
// dois chamadores.
//
// ⚠ E O QUE ELE NÃO É: `return true`. A distinção decide se a guarda é verificável.
// Uma função que devolve `true` literal é indetectável por EFEITO — nenhum teste
// consegue diferenciar "compara e concorda" de "não compara". Por isso
// `pertenceAoEscopo` é uma COMPARAÇÃO de verdade, que hoje só recebe operandos
// iguais: alimentada com dois escopos diferentes ela responde `false`, e há teste
// que prova exatamente isso. Quem a reescrever como `return true` derruba aquele
// teste; quem apagar a chamada dos dois pontos derruba o teste de PRESENÇA. São as
// duas metades que a F52 precisou de duas mutações para ter do lado do SQL.

/**
 * O escopo de gestão — "de quem é esta linha".
 *
 * Objeto, e não string, de propósito: na virada ele ganha campos (o id da empresa, e
 * possivelmente o papel dentro dela) sem mudar a assinatura de quem o compara.
 */
export type EscopoDeGestao = {
  /** O identificador da organização. Hoje há UM, e ele é literal. */
  readonly empresa: string
}

/**
 * O único escopo que existe hoje.
 *
 * O literal `'wap'` não é uma configuração e não deve virar uma: ele existe para que
 * a comparação tenha o que comparar enquanto não há tenant. Na F62 ele sai, junto com
 * o corpo das duas funções abaixo.
 */
export const ESCOPO_UNICO: EscopoDeGestao = { empresa: 'wap' }

/**
 * O escopo de quem está pedindo.
 *
 * ⚠ PONTO DE INJEÇÃO (F62/F69): aqui passa a sair a empresa da SESSÃO. Enquanto isso,
 * o sistema tem uma só, e devolver o escopo único é a resposta correta — não um
 * atalho.
 */
export function escopoDeGestaoAtual(): EscopoDeGestao {
  return ESCOPO_UNICO
}

/**
 * O escopo a que pertence uma linha de `import_logs`.
 *
 * ⚠ PONTO DE INJEÇÃO (F62/F69): aqui passa a sair `linha.empresa_id`. O parâmetro já
 * existe e já é passado pelos dois chamadores — é isso que torna a virada uma troca de
 * CORPO, e não uma caçada por call-sites.
 *
 * O parâmetro é aceito e IGNORADO hoje, e isso é deliberado: é o que torna a guarda um
 * no-op verificável em vez de uma promessa em comentário (o mesmo argumento escrito em
 * `mesmo_escopo_de_gestao`, migration 0132).
 */
export function escopoDoImportLog(_linha: { id: string }): EscopoDeGestao {
  return ESCOPO_UNICO
}

/**
 * O recurso pertence ao escopo de quem pede?
 *
 * É uma COMPARAÇÃO, não uma constante — ver o cabeçalho. Hoje os dois operandos são
 * sempre o mesmo objeto, então ela sempre responde `true`.
 */
export function pertenceAoEscopo(ator: EscopoDeGestao, recurso: EscopoDeGestao): boolean {
  return ator.empresa === recurso.empresa
}

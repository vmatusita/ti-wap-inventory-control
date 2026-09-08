/**
 * Dica de "por que o botão está desabilitado" para telas com confirmação DIGITADA
 * (F27 · ADM-07).
 *
 * Havia três implementações da mesma ideia — import (`importar-wizard.tsx`), apagar
 * conta (`apagar-usuario-dialog.tsx`) e a Zona destrutiva (`validators/dev-destrutivo.ts`
 * + `DialogoDestrutivo`) — e NENHUMA delas dizia por que o botão continuava desabilitado
 * quando o texto digitado não batia ("linhares" ≠ "Linhares" no import, sem explicação
 * nenhuma). O texto da dica agora é um só, nas TRÊS telas.
 *
 * ⚠ A régua de "o que conta como igual" continua em CADA TELA, de propósito — não foi
 * unificada, só a MENSAGEM:
 *   · import (`aplicarImport`, `actions/importar.ts`): ATUALIZADO NA F52, e deixou de
 *     ser o caso divergente. Era igualdade EXATA na Server Action, com a RPC não
 *     repetindo checagem nenhuma (quem chamasse a RPC direto pulava o campo inteiro).
 *     Agora a TELA, a action e a RPC usam a MESMA régua — `confirmacaoImportConfere`,
 *     logo abaixo, e `upper(btrim(coalesce(...)))` no banco. O import passou a tolerar
 *     caixa e espaço nas pontas, como os outros dois. É um AFROUXAMENTO deliberado:
 *     tudo o que era aceito antes continua sendo, e nada que era recusado passou a ser
 *     aceito por engano.
 *   · apagar conta (`validarExclusaoDeUsuario`, `validators/admin.ts`) e Zona destrutiva
 *     (`confirmacaoConfere`, `validators/dev-destrutivo.ts`): toleram caixa e espaço nas
 *     pontas — confirmado lendo a action/validator E as RPCs (0074 nem checa a
 *     confirmação — é só ergonomia de UI; 0082/0083 comparam com
 *     `upper(btrim(...)) <> upper(...)`).
 * Cada chamador calcula o próprio `confere` com a régua que já usa e passa o resultado
 * aqui — esta função só decide SE mostra a dica (campo não vazio e ainda não confere) e
 * formata o texto.
 */
/**
 * A confirmação digitada do IMPORT bate com o esperado? (F52)
 *
 * ⚠ ESTA FUNÇÃO E A EXPRESSÃO SQL DE `import_validar_plano` SÃO UMA RÉGUA SÓ — e agora
 * são TRÊS pontas: a tela (o botão), a Server Action e a RPC. Até a F52 eram duas
 * réguas: a action comparava por igualdade exata e a RPC não comparava nada, então quem
 * chamasse a RPC direto pulava o campo inteiro.
 *
 * A régua é a da CASA — `upper(btrim(coalesce(...)))`, as oito irmãs destrutivas de
 * `0082`/`0083`/`0087`/`0089` — e não a igualdade exata de antes. Ela é ESTRITAMENTE
 * MAIS PERMISSIVA, então tudo o que era aceito ontem continua sendo: é o critério de
 * não-regressão da fase.
 *
 * ⚠ ELA MORA AQUI, e não em `validators/importar.ts`, por causa do BUNDLE: o wizard é
 * Client Component e aquele módulo importa o motor de CSV/XLSX de `@/lib/import`.
 * Este módulo é puro, e o wizard já o importava. `validators/importar.ts` a reexporta
 * para quem é servidor.
 *
 * O espelho SQL é conferido por `validators/import-confirmacao-sql.test.ts`, que lê a
 * migration VIGENTE e prova que a expressão lá é esta régua, não outra.
 */
export function confirmacaoImportConfere(digitado: string, esperado: string): boolean {
  const a = (digitado ?? '').trim().toLocaleUpperCase('pt-BR')
  const b = (esperado ?? '').trim().toLocaleUpperCase('pt-BR')
  return a !== '' && a === b
}

export function dicaConfirmacaoNaoConfere(
  digitado: string,
  confere: boolean,
  esperado: string,
): string | null {
  if (digitado.trim() === '' || confere) return null
  return `O texto não confere — digite exatamente ${esperado}`
}

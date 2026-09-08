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
 *   · import (`aplicarImport`, `actions/importar.ts`): ATUALIZADO NA F52. Era o caso
 *     divergente — igualdade EXATA na Server Action, e a RPC não repetia a checagem
 *     (quem chamasse a RPC direto pulava o campo inteiro). Agora a action usa
 *     `confirmacaoImportConfere` (`validators/importar.ts`) e a RPC aplica a MESMA
 *     régua por dentro, com `upper(btrim(coalesce(...)))`. Ou seja: o import deixou de
 *     ser a exceção e passou a tolerar caixa e espaço nas pontas, como os outros dois.
 *     A mudança é um AFROUXAMENTO deliberado: tudo o que era aceito antes continua
 *     sendo, e nada que era recusado passou a ser aceito por engano.
 *   · apagar conta (`validarExclusaoDeUsuario`, `validators/admin.ts`) e Zona destrutiva
 *     (`confirmacaoConfere`, `validators/dev-destrutivo.ts`): toleram caixa e espaço nas
 *     pontas — confirmado lendo a action/validator E as RPCs (0074 nem checa a
 *     confirmação — é só ergonomia de UI; 0082/0083 comparam com
 *     `upper(btrim(...)) <> upper(...)`).
 * Cada chamador calcula o próprio `confere` com a régua que já usa e passa o resultado
 * aqui — esta função só decide SE mostra a dica (campo não vazio e ainda não confere) e
 * formata o texto.
 */
export function dicaConfirmacaoNaoConfere(
  digitado: string,
  confere: boolean,
  esperado: string,
): string | null {
  if (digitado.trim() === '' || confere) return null
  return `O texto não confere — digite exatamente ${esperado}`
}

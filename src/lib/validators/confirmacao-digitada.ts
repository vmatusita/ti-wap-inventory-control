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
 *   · import (`aplicarImport`, `actions/importar.ts`): o servidor compara IGUALDADE
 *     EXATA (`confirmacaoTexto !== filial.nome`, sem trim/caixa) — confirmado lendo a
 *     action; a RPC `importar_ativos_substituir` nem repete essa checagem, ela é só da
 *     Server Action. Afrouxar o cliente aqui habilitaria um botão que o servidor
 *     recusaria mesmo assim.
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

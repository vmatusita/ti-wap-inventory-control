// F32/RV-08 — "Novo colaborador: 219" não diz de quanto. A leitura gerencial de
// um ranking por motivo é sempre RELATIVA ("metade das saídas é contratação"):
// nenhuma contagem muda, isto é só o rótulo que soma a leitura que faltava.
//
// Arredondamento: `Math.round` por item, cada um contra o TOTAL DA PRÓPRIA
// LISTA. Cada barra é lida ISOLADA (o operador passa o mouse numa linha de
// cada vez) — não é a legenda de uma pizza, onde a soma tem que fechar em
// 100%. Por isso não usamos distribuição de resto (método d'Hondt/maior resto):
// aquele método forçaria a soma a fechar, mas faria o número mostrado numa
// linha ESPECÍFICA discordar de `valor / total` — pior para quem lê uma barra
// só. A consequência aceita: a soma dos percentuais da lista pode passar de
// 100% (ou ficar abaixo) por até ~1 ponto por item — ver o teste que soma 101%.
//
// Um item que arredonda para 0% (ex.: 1 de 1000) precisa aparecer como "0%",
// não sumir: sumir sugeriria "não temos essa leitura", quando na verdade temos
// — é só pequena. Por isso `percentualDaLista` só devolve `null` quando o
// total inteiro não permite NENHUMA leitura relativa (soma zero, negativa ou
// não-finita); `rotuloComPercentual` preserva esse `null` tal e qual, mas quem
// chama nunca deve tratar `0` como "ausente" (armadilha comum: `if (percentual)`
// esconderia o 0% genuíno junto com o null).

/**
 * Percentual (0–100, inteiro) que `valor` representa dentro de `total`.
 * `null` quando `total` não permite leitura relativa: soma zero, negativa ou
 * não-finita. `valor` negativo ou não-finito também vira `null` — não há
 * fração de algo que não é uma contagem válida.
 */
export function percentualDaLista(valor: number, total: number): number | null {
  if (!Number.isFinite(valor) || !Number.isFinite(total)) return null
  if (total <= 0) return null
  if (valor < 0) return null
  return Math.round((valor / total) * 100)
}

/**
 * Par pronto para desenho: `valor` formatado em pt-BR (milhar com ponto) e
 * `percentual` já como texto com o `%` — ou `null` quando `percentualDaLista`
 * não tem leitura relativa a dar (ver comentário do módulo). O percentual não
 * precisa de `toLocaleString`: está sempre entre 0 e 100, faixa em que pt-BR e
 * en-US formatam dígitos puros de forma idêntica (sem separador de milhar).
 */
export function rotuloComPercentual(
  valor: number,
  total: number,
): { valor: string; percentual: string | null } {
  const percentual = percentualDaLista(valor, total)
  return {
    valor: valor.toLocaleString('pt-BR'),
    percentual: percentual === null ? null : `${percentual}%`,
  }
}

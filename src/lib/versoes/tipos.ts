// Tipos do versionamento do sistema (F35). Modulo PURO, sem import de servidor —
// espelha `src/lib/ajuda/tipos.ts`: e o unico arquivo de `lib/versoes` que um
// Client Component pode tocar (so para tipos, que somem na compilacao).

export type EntradaVersao = {
  /** Semver `maior.menor.correcao`. Fase = menor nova; entrega avulsa = correcao. */
  versao: string
  /** Data ISO `yyyy-MM-dd` — a do cabecalho da entrada no CHANGELOG, nao a do commit. */
  data: string
  /** Rotulo curto da ordem de servico (`F34`), quando a versao veio de uma fase. */
  fase?: string
  /** Uma linha: o que esta versao entregou. */
  titulo: string
  /**
   * De 2 a 6 itens, EM LINGUAGEM DE OPERADOR — o que a pessoa que usa o sistema
   * ve mudar. O CHANGELOG e narrativa de desenvolvedor; aqui se traduz.
   */
  mudancas: string[]
}

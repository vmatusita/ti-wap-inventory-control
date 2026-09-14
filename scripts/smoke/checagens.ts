// A FOTO DAS DOZE CHECAGENS (F56 · Frente G) — comparação antes × depois do smoke.
//
// Lê `checagens_integridade_resumo()` (migration 0138) — a ÚNICA porta que uma
// sessão `authenticated` comum alcança: `checagens_integridade_nucleo()` tem
// `revoke ... from ... authenticated` (só quem já tem privilégio de Management
// API/Postgres a chama direto — confirmado por leitura em produção/ensaio ao medir
// esta fase); `dev_checagens_integridade()` exige cargo `dev`, que a persona
// (`admin`) não tem. A guarda de `checagens_integridade_resumo()` é
// `papel_atual() is not null` — qualquer logado ATIVO, inclusive a persona.
//
// Só TOTAIS (chave, total) — a função nem devolve a coluna `amostra` (que
// carregaria patrimônio/nome de pessoa); nada aqui é dado de negócio.

// Tipo da sessão da persona — DELIBERADAMENTE `any`. Ver o comentário longo em
// `scripts/smoke/fixtures-passe2.ts` (mesma decisão, mesma medição de
// incompatibilidade entre `SupabaseClient` e `ReturnType<typeof createClient>`
// nesta versão do pacote).
type Sessao = any // eslint-disable-line @typescript-eslint/no-explicit-any

export type ResumoChecagens = Record<string, number>

/** Lê as doze checagens com a SESSÃO da persona (nunca service role — é a mesma
 *  porta que o smoke agendado usa, `.github/workflows/saude.yml`). */
export async function lerChecagens(sessao: Sessao): Promise<ResumoChecagens> {
  const { data, error } = await sessao.rpc('checagens_integridade_resumo')
  if (error) throw new Error(`Falha ao ler as checagens de integridade: ${error.message}`)
  const resumo: ResumoChecagens = {}
  for (const linha of (data ?? []) as { chave: string; total: number }[]) {
    resumo[linha.chave] = Number(linha.total)
  }
  return resumo
}

export type DivergenciaChecagem = { chave: string; antes: number; depois: number }

/**
 * Compara duas fotos, chave a chave — nunca amostra. Uma chave ausente de um dos
 * dois lados TAMBÉM é divergência (a lista de checagens não deveria mudar de
 * tamanho entre o antes e o depois do smoke).
 */
export function compararChecagens(
  antes: ResumoChecagens,
  depois: ResumoChecagens,
): DivergenciaChecagem[] {
  const chaves = new Set([...Object.keys(antes), ...Object.keys(depois)])
  const divergencias: DivergenciaChecagem[] = []
  for (const chave of chaves) {
    const a = antes[chave] ?? 0
    const d = depois[chave] ?? 0
    if (a !== d) divergencias.push({ chave, antes: a, depois: d })
  }
  return divergencias.sort((x, y) => x.chave.localeCompare(y.chave))
}

/** Tabela de texto simples para o relatório final — só totais, pt-BR. */
export function tabelaChecagens(antes: ResumoChecagens, depois: ResumoChecagens): string {
  const chaves = [...new Set([...Object.keys(antes), ...Object.keys(depois)])].sort()
  return chaves
    .map((c) => {
      const a = antes[c] ?? 0
      const d = depois[c] ?? 0
      const marca = a === d ? '=' : '≠'
      return `  ${c.padEnd(32)} antes=${String(a).padStart(4)}  depois=${String(d).padStart(4)}  ${marca}`
    })
    .join('\n')
}

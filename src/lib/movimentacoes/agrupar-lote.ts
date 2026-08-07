// Separador visual de LOTE na lista de movimentações (F28/MOV-06). Um lote de
// 12 ativos registrado de uma vez vira 12 linhas idênticas na lista, sem
// nenhum vínculo visual entre elas.
//
// NÃO existe `lote_id` no banco e não vamos criar um: o agrupamento aqui é
// DERIVADO, calculado em cima do que a lista já mostra — AUTOR e MINUTO de
// `created_at` (o instante em que a linha foi GRAVADA, não `data`, que é a
// data de negócio e pode ser retroativa). `inicioDeLote` devolve o conjunto de
// ids que COMEÇAM um bloco novo em relação à linha anterior NA ORDEM DE
// EXIBIÇÃO da tabela (mais recente primeiro); a primeira linha da página nunca
// marca, porque não há separador acima dela.
//
// Minuto é o ISO TRUNCADO, em UTC — não convertido para o fuso de São Paulo
// como o resto do app faz para EXIBIÇÃO. Aqui não há nada para mostrar, só uma
// comparação de igualdade, e o offset de SP é uma constante inteira de horas
// (-03:00, sem horário de verão desde 2019 — `format.ts`): truncar ao minuto
// COMUTA com um deslocamento inteiro de minutos, então "mesmo minuto em UTC" e
// "mesmo minuto em SP" são exatamente a mesma partição — nunca discordam. Reduz
// a uma comparação de string, sem `Intl`/fuso por linha. A escolha é MINUTO, não
// segundo: a latência de rede entre bipar o primeiro e o último ativo de um lote
// grande facilmente atravessa um segundo, e "mesmo segundo" separaria lotes reais.
//
// LIMITAÇÃO CONHECIDA E ACEITA (documentar também no relatório da fase): minuto
// é uma aproximação, não uma chave. Dois operadores que gravam LOTES DIFERENTES
// no mesmo minuto (raro, mas possível com mais de um operador simultâneo na
// mesma filial) aparecem como um bloco só; um lote grande cuja gravação
// atravessa a virada de um minuto aparece partido em dois blocos. Nenhuma das
// duas classes é distinguível sem uma coluna própria no banco.

// 'YYYY-MM-DDTHH:mm' do instante, em UTC — string simples, comparável por
// igualdade. `toISOString()` normaliza o formato (com/sem milissegundos, `Z` ou
// `+00:00` na entrada) antes de truncar.
function minutoTruncado(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toISOString().slice(0, 16)
}

export type LinhaParaAgrupar = {
  id: string
  created_at: string
  autor_nome: string | null
}

// `linhas` na ORDEM DE EXIBIÇÃO (mais recente primeiro — a mesma ordem que
// `listarMovimentacoes` devolve). Pura — sem `Date.now()`, sem acesso a rede.
export function inicioDeLote(
  linhas: readonly LinhaParaAgrupar[],
): Set<string> {
  const inicios = new Set<string>()
  let anterior: { autor: string | null; minuto: string } | null = null

  for (const linha of linhas) {
    const atual = { autor: linha.autor_nome, minuto: minutoTruncado(linha.created_at) }
    if (
      anterior !== null &&
      (atual.autor !== anterior.autor || atual.minuto !== anterior.minuto)
    ) {
      inicios.add(linha.id)
    }
    anterior = atual
  }

  return inicios
}

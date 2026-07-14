import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// Datas por extenso dos termos (F5A). Recebem uma data pura 'yyyy-MM-dd' (a data
// de geração/edição, que também alimenta termo_data) e devolvem o texto congelado
// no documento — NÃO é campo automático do Word (§2 achado 4).

// Corpo dos termos: "14 de julho de 2026". Mês em minúscula (ortografia pt-BR;
// corrige a caixa inconsistente herdada dos modelos — §10.5).
export function dataPorExtenso(iso: string): string {
  return format(parseISO(iso), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
}

// Cabeçalho do termo de devolução: "Julho/2026" (mês capitalizado — mantém o
// estilo "Mês/Ano" que o modelo usa hoje).
export function mesAnoPorExtenso(iso: string): string {
  const s = format(parseISO(iso), 'MMMM/yyyy', { locale: ptBR })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

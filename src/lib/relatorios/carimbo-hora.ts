import { formatTime } from '@/lib/format'

// "atualizado às HH:mm" (RV-16) — o carimbo de frescor do relatório ao vivo
// (`realtime-refresh.tsx`) e do visualizador por senha (`viewer-auto-refresh.tsx`).
// `quando` entra por PARÂMETRO (mesma convenção de pureza de `formatTempoRelativo`
// em src/lib/format.ts, que recebe `agora: number`): sem isso a função não seria
// testável, e os componentes não poderiam congelar o valor dentro do efeito que
// evita o erro de hidratação (ver comentário nos dois componentes que chamam
// esta função).
//
// Fuso: SÃO PAULO, não o do navegador de quem lê — decisão, não default.
// `formatTime` já resolve a conversão para `America/Sao_Paulo` e é REUSADO aqui
// de propósito (não duplicar lógica de fuso, ver comentário de `formatTime`). O
// relatório inteiro raciocina no fuso de SP — período, datas das tabelas, o
// `formatDateTime` do snapshot gerado. Se este carimbo usasse o fuso do
// navegador, um gestor lendo de outro fuso veria "atualizado às 14:32" e teria
// que adivinhar QUAL relógio está falando (o dele ou o do relatório) antes de
// decidir se a página está fresca. Fixar SP em toda a página — inclusive aqui —
// elimina a pergunta: existe um único relógio no relatório inteiro.
export function carimboAtualizado(quando: number | Date): string {
  const data = quando instanceof Date ? quando : new Date(quando)
  if (Number.isNaN(data.getTime())) return ''
  const hora = formatTime(data.toISOString())
  return hora === '—' ? '' : `atualizado às ${hora}`
}

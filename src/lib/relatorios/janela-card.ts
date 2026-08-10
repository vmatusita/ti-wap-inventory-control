// O microssinal "foto × período" (OS-F32/RV-04, análise §2). A confusão de
// leitura nº 1 de um relatório de estoque é misturar FOTO ("Estoque no último
// dia", KPI as-of — um instante) com FILME ("Saídas por motivo", série, Δ — um
// intervalo). Hoje a distinção mora só no fraseado livre de cada subtítulo;
// esta função dá um rótulo curto e uniforme para virar chip no card
// (`CardRelatorio`, prop `janela`).
//
// Formatação por FATIAMENTO DA STRING ISO — de propósito, não por preguiça.
// `src/lib/format.ts` documenta a armadilha: qualquer `new Date(iso)` de uma
// data PURA ('yyyy-MM-dd', sem hora) é interpretado como meia-noite UTC pelo
// motor JS; formatar essa Date de volta no fuso local (ou pior, sem fuso
// nenhum, como faria um `getDate()`/`getMonth()` cru) pode "voltar um dia"
// dependendo de onde o processo roda. `formatDate` de format.ts evita isso
// com `parseISO` (que É seguro), mas essa função devolve 'dd/MM/yyyy' e aqui
// precisamos de 'dd/MM' sem ano — em vez de fatiar o resultado de outra
// função (acoplamento por string), fatiamos a ISO diretamente: dado o formato
// FIXO 'yyyy-MM-dd', os caracteres[8:10] são o dia e [5:7] o mês, sempre,
// sem passar por NENHUM objeto Date. Zero fuso envolvido, zero risco.

export type JanelaCard = 'foto' | 'periodo'

// Mesma política de forma de `DATA_PURA_RE` em format.ts: valida o FORMATO
// (4-2-2 dígitos), não o calendário. Uma data upstream com dia fora do range
// (ex.: um bug em outra camada) produz um chip esquisito, não um crash — e
// como o período do relatório já passa por validação própria antes de chegar
// aqui, a política "shape-only" existente é suficiente e evita duplicar regra.
const ISO_DATA_PURA_RE = /^\d{4}-\d{2}-\d{2}$/

// EXPORTADA desde o RV-06 (a evolução do estoque rotula cada ponto em dd/MM e
// congela o rótulo no snapshot): duas cópias da mesma regra de fatiamento seriam
// duas chances de a armadilha de fuso voltar por uma delas.
export function ddMM(iso: string): string | null {
  if (!ISO_DATA_PURA_RE.test(iso)) return null
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

// 'foto' → "foto de dd/MM" (a data de FIM do período — é o "último dia" do
// as-of, `de` nem entra na conta). 'periodo' → "dd/MM – dd/MM" (en dash com
// espaços, como no texto da ordem). ISO malformado ou período incompleto
// devolve '' — o card (CardRelatorio) usa isso para decidir NÃO renderizar o
// chip, em vez de mostrar um rótulo quebrado.
export function textoJanela(janela: JanelaCard, periodo: { de: string; ate: string }): string {
  const ate = ddMM(periodo?.ate)
  if (janela === 'foto') {
    return ate ? `foto de ${ate}` : ''
  }
  const de = ddMM(periodo?.de)
  if (!de || !ate) return ''
  return `${de} – ${ate}`
}

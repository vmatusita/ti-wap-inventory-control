// Limites de tamanho do import de startup (OS-F7). FONTE ÚNICA — era duplicado na
// Server Action (`src/lib/actions/importar.ts`) e no wizard
// (`src/components/admin/importar/importar-wizard.tsx`). Leaf puro: importável tanto
// no servidor quanto no cliente sem puxar o barrel/motor.

/**
 * Tamanho máximo do arquivo (CSV ou XLSX — F7G) aceito no import.
 *
 * DECISÃO (W3): 5 MB. O maior inventário real das 5 filiais fica na casa de
 * dezenas/centenas de KB; 5 MB cobre folgadamente e barra upload acidental de
 * arquivo errado (um dump gigante). O .xlsx é comprimido, então 5 MB brutos já são
 * muitíssimas linhas; o leitor tem tetos próprios de linhas/colunas
 * (`src/lib/import/xlsx.ts`) contra planilha absurda.
 *
 * Fica ABAIXO do `bodySizeLimit` de 8 MB da Server Action (`next.config.ts`): o maior
 * plano real (~1.200 ativos) serializa em ~0,7 MB, então há margem larga entre os dois.
 */
export const TAMANHO_MAX_ARQUIVO = 5 * 1024 * 1024

/** Rótulo legível do limite acima, para as mensagens de erro ("o limite é 5 MB"). */
export const TAMANHO_MAX_ROTULO = '5 MB'

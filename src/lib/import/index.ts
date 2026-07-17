// Superfície pública do motor de import de startup (OS-F7 / W1, ampliada pela
// OS-F7B). O W3 importa daqui: `import { validarCsvImport } from '@/lib/import'`.
export { validarCsvImport, montarPlanoImport, hashConteudo } from './plano'

// F7B — motor de correções. `csvCorrigido` é a fachada do contrato §1.5
// (decodificar → parseCsv → aplicarCorrecoes → reserializar, SEM BOM — quem
// baixa põe o BOM); `validarCorrecao` é a mesma régua que a UI usa para
// desabilitar o que não vale (o servidor é a primeira linha, não a única).
export {
  COLUNA_POR_CAMPO,
  agruparErros,
  aplicarCorrecoes,
  campoDaOp,
  csvCorrigido,
  csvCorrigidoParaTexto,
  sugerirValor,
  validarCorrecao,
} from './correcoes'

// Vocabulários canônicos: o Select da tela escolhe o ESTADO/CATEGORIA e grava na
// célula o TERMO que o De→Para entende.
export {
  CATEGORIAS_TERMOS,
  ESTADOS_CORRIGIVEIS,
  SITUACAO_CANONICA,
  TIPO_CANONICO,
} from './deparas'

// Re-export para o Zod das actions (W3) e o preview ao vivo da UI.
// F7E — `resolverDataEntrega` (datas dd/MMM do arquivo) e `patrimonioVazio`
// (patrimônio "vazio na prática" → importa nulo) fazem parte do contrato §1.5.
export {
  extrairPatrimonioDoHostname,
  mapearUnidade,
  parseData,
  patrimonioVazio,
  resolverDataEntrega,
} from './deparas'
export { canonicalizarPatrimonio } from '@/lib/patrimonio'
export { mapaColunas } from './parse'
export type { CsvCru, RegistroImport } from './parse'

export type {
  AtivoPlano,
  CampoEditavel,
  CategoriaAtivo,
  CorrecaoImport,
  ErroImport,
  FilialOficial,
  FilialSelecionada,
  GrupoErro,
  LayoutImport,
  PlanoImport,
  StatusAtivo,
  ValidacaoImport,
} from './tipos'

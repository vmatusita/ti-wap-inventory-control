// Superfície pública do motor de import de startup (OS-F7 / W1, ampliada pela
// OS-F7B e pela F56 · Frente D). O W3 importa daqui:
// `import { validarArquivoImport } from '@/lib/import'`.
// F7G — `validarArquivoImport` (async) é a entrada única CSV/XLSX; `validarCsvImport`
// (sync) segue exportada para a suíte de testes da F7/F7B/F7E. `csvCorrigidoDeArquivo`
// gera o "baixar corrigido" para os dois formatos. F56 · Frente D — as duas recebem o
// vocabulário do import (`VocabularioImport`) por parâmetro; quem chama o motor é
// quem fala com o banco (o motor continua puro).
export {
  validarArquivoImport,
  validarCsvImport,
  csvCorrigidoDeArquivo,
  montarPlanoImport,
  hashConteudo,
} from './plano'

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

// F56 · Frente D — o vocabulário do import como DADO: o tipo serializável, a
// fatia de cliente, o construtor/conferência e as funções que o motor usa, no
// padrão `rotuloTipoItem(slug, mapa)` (F39). O Select da tela escolhe o
// ESTADO/CATEGORIA e grava na célula o TERMO que o vocabulário entende.
export {
  categoriasImportaveis,
  conferirVocabulario,
  estadoPlanilha,
  estadosImportaveis,
  filialDoVocabulario,
  mapearCategoria,
  mapearUnidade,
  paraCliente,
  rotuloCategoria,
  rotuloEstado,
  termosCategoria,
  termosEstadoCorrigiveis,
  VocabularioImportInvalidoError,
} from './vocabulario'
export type {
  ApelidoVocabulario,
  FilialVocabulario,
  TermoCategoriaVocabulario,
  TermoEstadoVocabulario,
  VocabularioCliente,
  VocabularioImport,
} from './vocabulario'

// Re-export para o Zod das actions (W3) e o preview ao vivo da UI.
// F7E — `resolverDataEntrega` (datas dd/MMM do arquivo) e `patrimonioVazio`
// (patrimônio "vazio na prática" → importa nulo) fazem parte do contrato §1.5.
export {
  extrairPatrimonioDoHostname,
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
  CategoriaImport,
  CorrecaoImport,
  ErroImport,
  EstadoAlvoImport,
  EstadoPlanilha,
  FilialSelecionada,
  GrupoErro,
  LayoutImport,
  PlanoImport,
  ValidacaoImport,
} from './tipos'

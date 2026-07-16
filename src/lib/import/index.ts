// Superfície pública do motor de import de startup (OS-F7 / W1). O W3 importa
// daqui: `import { validarCsvImport } from '@/lib/import'`.
export { validarCsvImport, montarPlanoImport, hashConteudo } from './plano'
export type {
  AtivoPlano,
  CategoriaAtivo,
  ErroImport,
  FilialOficial,
  FilialSelecionada,
  LayoutImport,
  PlanoImport,
  StatusAtivo,
  ValidacaoImport,
} from './tipos'

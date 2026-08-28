import { z } from 'zod'

// Schemas do cadastro de pessoas (F37 · D5). Mesmo idioma dos schemas de catálogo
// (`item.ts`, `admin.ts`): a mensagem em pt-BR mora AQUI — não existe camada de
// tradução depois, a mensagem do schema já é a mensagem da tela.

/** Limite do `nome`: generoso, mas não infinito. 80 é o mesmo teto de `itens.nome`. */
const nome = z
  .string()
  .trim()
  .min(2, 'Informe o nome do colaborador')
  .max(80, 'Nome: no máximo 80 caracteres')

/** Campos que ficam vazios com frequência: string vazia vira `null`, não `''`. */
const opcional = (max: number, msg: string) =>
  z
    .string()
    .trim()
    .max(max, msg)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .default(null)

export const colaboradorSchema = z.object({
  nome,
  matricula: opcional(40, 'Matrícula: no máximo 40 caracteres'),
  setor: opcional(80, 'Setor: no máximo 80 caracteres'),
  // Filial é ATRIBUTO da pessoa, não escopo de escrita — por isso é opcional e não
  // manda em permissão nenhuma (quem cria colaborador não precisa de vínculo com a
  // filial dele). Ver a ata de RLS em docs/DECISOES.md.
  filial_id: z.coerce
    .number()
    .int()
    .positive()
    .nullable()
    .default(null),
})

export const atualizarColaboradorSchema = colaboradorSchema.extend({
  id: z.string().uuid('Colaborador inválido'),
  ativo: z.boolean(),
})

/**
 * Criação INLINE no meio do fluxo (molde do `itemInlineSchema`, F10): quem está
 * lançando uma movimentação informa só o nome — setor e matrícula ficam para a tela
 * de administração, com calma. A filial vai junto porque o fluxo já sabe qual é.
 */
export const colaboradorInlineSchema = z.object({
  nome,
  filial_id: z.coerce.number().int().positive().nullable().default(null),
})

/**
 * Consolidação em lote: as chaves escolhidas na fila de /admin/colaboradores.
 * Vem a CHAVE, não o nome — a tela oferece o que a view agrupou, e o servidor
 * reconfere na própria view antes de criar (nada é criado a partir de texto que o
 * cliente inventou).
 */
export const consolidarColaboradoresSchema = z.object({
  chaves: z
    .array(z.string().trim().min(1))
    .min(1, 'Escolha pelo menos um nome para cadastrar')
    .max(200, 'Cadastre no máximo 200 de uma vez'),
})

export type ColaboradorInput = z.infer<typeof colaboradorSchema>
export type ColaboradorInlineInput = z.infer<typeof colaboradorInlineSchema>

/**
 * A frase da colisão do índice único `colaboradores_nome_chave_uidx`.
 *
 * Existe como CONSTANTE porque a colisão é uma consequência REAL do desenho, não um
 * acidente: duas pessoas com o mesmo nome normalizado não cabem no cadastro (ata em
 * docs/DECISOES.md). O operador precisa de uma saída, e a frase dá as duas que
 * existem — diferenciar o nome, ou usar a matrícula.
 */
export const MSG_COLABORADOR_DUPLICADO =
  'Já existe um colaborador com este nome. Diferencie o nome (acrescente o sobrenome completo) ou registre a matrícula para distinguir as duas pessoas.'

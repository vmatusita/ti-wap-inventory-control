import { z } from 'zod'

// Criação de senha de acesso aos relatórios (spec §3 / OS-F3 3.9) — antes inline em actions/senhas.ts.
//
// F68 (19/11/2026): a senha vira bcrypt DENTRO do banco (`senha_acesso_criar`, 0211), e o bcrypt só usa os primeiros 72
// BYTES — acima disso duas senhas diferentes abririam a mesma linha. Por isso o teto é em BYTES de UTF-8 (letra com
// acento conta 2), e o banco o confere de novo (a mesma régua: 8 a 72 bytes). Recusar, e não pré-hashear: é a única
// escolha que prova por construção que duas senhas diferentes nunca valem como iguais.
export const SENHA_MAX_BYTES = 72

const bytes = (s: string) => new TextEncoder().encode(s).length

export const criarSenhaSchema = z.object({
  rotulo: z.string().trim().min(2, 'Informe um rótulo').max(80),
  senha: z
    .string()
    .min(8, 'A senha precisa de ao menos 8 caracteres')
    .refine((s) => bytes(s) <= SENHA_MAX_BYTES, {
      message: 'A senha pode ter no máximo 72 bytes (letra com acento conta 2).',
    }),
})

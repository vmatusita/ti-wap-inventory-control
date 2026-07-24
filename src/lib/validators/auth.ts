import { z } from 'zod'

// Login: a validacao forte de e-mail/senha fica no Supabase Auth;
// aqui garantimos apenas que os campos vieram preenchidos.
export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Informe o e-mail'),
  senha: z.string().min(1, 'Informe a senha'),
})

// Nome e sobrenome do operador: dois campos separados, informados pela propria
// pessoa ao aceitar o convite (migration 0057 — profiles.primeiro_nome/sobrenome).
// Teto de 60: o valor sai impresso no campo "tecnico" dos termos .docx (F5A).
export const NOME_PESSOA_MAX = 60

const nomePessoa = (campo: 'nome' | 'sobrenome') =>
  z
    .string()
    .trim()
    .min(2, `Informe seu ${campo}`)
    .max(NOME_PESSOA_MAX, `O ${campo} pode ter no maximo ${NOME_PESSOA_MAX} caracteres`)

// Tela /auth/definir-senha (convite e recuperacao): nome + sobrenome + senha.
export const definirAcessoSchema = z
  .object({
    nome: nomePessoa('nome'),
    sobrenome: nomePessoa('sobrenome'),
    senha: z.string().min(8, 'A senha precisa de ao menos 8 caracteres'),
    confirmacao: z.string(),
  })
  .refine((valores) => valores.senha === valores.confirmacao, {
    path: ['confirmacao'],
    message: 'As senhas nao conferem',
  })

export type DefinirAcessoInput = z.input<typeof definirAcessoSchema>

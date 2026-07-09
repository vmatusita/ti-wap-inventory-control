import { z } from 'zod'

// Login: a validacao forte de e-mail/senha fica no Supabase Auth;
// aqui garantimos apenas que os campos vieram preenchidos.
export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Informe o e-mail'),
  senha: z.string().min(1, 'Informe a senha'),
})

// Definicao de senha do usuario convidado.
export const novaSenhaSchema = z
  .object({
    senha: z.string().min(8, 'A senha precisa de ao menos 8 caracteres'),
    confirmacao: z.string(),
  })
  .refine((valores) => valores.senha === valores.confirmacao, {
    path: ['confirmacao'],
    message: 'As senhas nao conferem',
  })

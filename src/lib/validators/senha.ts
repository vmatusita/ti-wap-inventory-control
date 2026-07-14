import { z } from 'zod'

// Criação de senha de acesso aos relatórios (spec §3 / OS-F3 3.9) — antes inline
// em actions/senhas.ts.
export const criarSenhaSchema = z.object({
  rotulo: z.string().trim().min(2, 'Informe um rótulo').max(80),
  senha: z.string().min(8, 'A senha precisa de ao menos 8 caracteres').max(200),
})

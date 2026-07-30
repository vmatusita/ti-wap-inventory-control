// Domínios de e-mail aceitos no login de OPERADOR (spec §3).
//
// Até 22/07/2026 era só `@wap.ind.br`. Decisão do Johnny (22/07/2026): a equipe
// terceirizada da Stefanini passa a OPERAR o sistema — não só consultar relatório
// por senha de acesso —, então `@stefanini.com` e `@latam.stefanini.com` também
// entram. O convite segue sendo o único caminho (não há auto-cadastro).
//
// F21 (29/07/2026): o "nível único" que este comentário afirmava ACABOU. Quem passa por
// esta lista ganha um CARGO (admin/operador/consulta — `src/lib/auth/papeis.ts`), e o
// domínio decide apenas se a conta PODE existir, não o que ela pode fazer. Ver
// docs/ADR-002-papeis-e-permissoes.md.
//
// Esta lista é a SEGUNDA linha de defesa. A trava real é o trigger
// `handle_new_user` no banco (migrations 0001 → 0041): mexeu aqui, mexa lá também.
export const DOMINIOS_OPERADOR = [
  '@wap.ind.br',
  '@stefanini.com',
  '@latam.stefanini.com',
] as const

// Casamento por sufixo exato COM o '@': `@stefanini.com` NÃO aceita
// `alguem@fake-stefanini.com`, e `@latam.stefanini.com` é um domínio à parte —
// não entra pelo padrão do outro. Espelha o `ilike '%@dominio'` do trigger.
export function emailDeOperador(email: string): boolean {
  const e = email.trim().toLowerCase()
  return DOMINIOS_OPERADOR.some((dominio) => e.endsWith(dominio))
}

// "@wap.ind.br, @stefanini.com ou @latam.stefanini.com" — texto das mensagens da
// UI, derivado da lista para não haver como um sair de sincronia com o outro.
function listar(dominios: readonly string[]): string {
  const [ultimo, ...anteriores] = [...dominios].reverse()
  if (!ultimo) return ''
  if (anteriores.length === 0) return ultimo
  return `${anteriores.reverse().join(', ')} ou ${ultimo}`
}

export const DOMINIOS_TEXTO = listar(DOMINIOS_OPERADOR)

import { describe, it, expect, vi } from 'vitest'

// senha-sessao.ts importa 'server-only' (guarda anti-vazamento de node:crypto ao
// cliente). No ambiente node do Vitest esse import lançaria — stub vazio. Mesmo
// padrão de senha-sessao.test.ts.
vi.mock('server-only', () => ({}))

import { hashSenha, verificarSenha } from '@/lib/auth/senha-sessao'

// R-ACC-03 — hash das senhas de acesso do relatório via `crypto.scrypt` NATIVO
// (CLAUDE.md proíbe lib de hash). Formato guardado: `scrypt$<salt hex>$<derivado hex>`.
// hashSenha/verificarSenha não usam VIEW_SESSION_SECRET (só o cookie HMAC usa), então
// nenhum env é necessário aqui. O HMAC do cookie já é coberto por senha-sessao.test.ts.

describe('hashSenha (scrypt nativo) — R-ACC-03', () => {
  it('produz o formato scrypt$<salt>$<derivado> com 3 partes', async () => {
    const hash = await hashSenha('minha-senha-123')
    const partes = hash.split('$')
    expect(partes).toHaveLength(3)
    expect(partes[0]).toBe('scrypt')
    // salt e derivado são hex não vazios.
    expect(partes[1]).toMatch(/^[0-9a-f]+$/)
    expect(partes[2]).toMatch(/^[0-9a-f]+$/)
  })

  it('o hash NÃO contém a senha em claro', async () => {
    const senha = 'super-secreta-em-claro'
    const hash = await hashSenha(senha)
    expect(hash).not.toContain(senha)
  })

  it('dois hashes da MESMA senha diferem (salt aleatório por chamada)', async () => {
    const a = await hashSenha('senha-repetida')
    const b = await hashSenha('senha-repetida')
    expect(a).not.toBe(b)
    // Salts diferentes.
    expect(a.split('$')[1]).not.toBe(b.split('$')[1])
  })
})

describe('verificarSenha (timing-safe) — R-ACC-03', () => {
  it('roundtrip: hash depois verifica true com a senha certa', async () => {
    const senha = 'wap-relatorio-2026'
    const hash = await hashSenha(senha)
    expect(await verificarSenha(senha, hash)).toBe(true)
  })

  it('roundtrip com caracteres especiais / unicode', async () => {
    const senha = 'Ãçé!@# 你好 🔐'
    const hash = await hashSenha(senha)
    expect(await verificarSenha(senha, hash)).toBe(true)
  })

  it('senha errada verifica false', async () => {
    const hash = await hashSenha('senha-correta')
    expect(await verificarSenha('senha-errada', hash)).toBe(false)
  })

  it('senha de OUTRO hash verifica false (cross-check)', async () => {
    const hashA = await hashSenha('senha-A')
    expect(await verificarSenha('senha-B', hashA)).toBe(false)
  })

  it('hash malformado (sem prefixo scrypt) verifica false', async () => {
    expect(await verificarSenha('x', 'bcrypt$abc$def')).toBe(false)
    expect(await verificarSenha('x', 'sem-cifroes')).toBe(false)
    expect(await verificarSenha('x', '')).toBe(false)
  })

  it('hash com número de partes errado verifica false', async () => {
    expect(await verificarSenha('x', 'scrypt$soUmaParteDeSalt')).toBe(false)
    expect(await verificarSenha('x', 'scrypt$salt$derivado$extra')).toBe(false)
  })

  it('hash com derivado vazio verifica false', async () => {
    expect(await verificarSenha('x', 'scrypt$abcdef$')).toBe(false)
  })

  it('roundtrip de senha vazia é consistente consigo mesmo', async () => {
    const hash = await hashSenha('')
    expect(await verificarSenha('', hash)).toBe(true)
    expect(await verificarSenha('nao-vazia', hash)).toBe(false)
  })
})

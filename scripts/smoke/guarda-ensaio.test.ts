import { describe, expect, it } from 'vitest'
import { confereAmbienteDeEnsaio, type EnvSmokeImport } from './guarda-ensaio'

// A GUARDA do smoke do import no ENSAIO (F56 · Frente G), provada em isolamento —
// zero rede, zero client Supabase: só o PRIMEIRO portão (`confereAmbienteDeEnsaio`),
// que é síncrono e puro. O segundo portão (`confereRotuloDeEnsaio`, que pergunta
// `rotulo_de_ambiente()` ao PRÓPRIO BANCO) não entra aqui — provar ele exigiria
// apontar de verdade para um projeto, e a regra do prompt é clara: "nunca um teste
// que aponte o smoke de verdade para produção para ver se ele recusa". A prova dos
// dois portões AMARRADOS é o roteiro real (scripts/smoke/import-ensaio.ts) contra o
// ensaio, não este arquivo.

const REF_ENSAIO = 'sgmvldiizsrjbxzzpmhh'
const REF_PRODUCAO = 'pbtjcalbmepmrqzprusb'
const REF_INVENTADO = 'aaaaaaaaaaaaaaaaaaaa'

function envDoEnsaio(extra: Partial<EnvSmokeImport> = {}): EnvSmokeImport {
  return {
    NEXT_PUBLIC_SUPABASE_URL: `https://${REF_ENSAIO}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-ficticia-de-teste',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-ficticia-de-teste',
    ...extra,
  }
}

describe('confereAmbienteDeEnsaio — o primeiro portão da guarda (F56 · Frente G)', () => {
  it('recusa o ref de PRODUÇÃO', () => {
    const env = envDoEnsaio({ NEXT_PUBLIC_SUPABASE_URL: `https://${REF_PRODUCAO}.supabase.co` })
    expect(() => confereAmbienteDeEnsaio(env)).toThrow(/PRODUÇÃO/)
  })

  it('recusa um ref INVENTADO (fora da lista de permissão de ensaio)', () => {
    const env = envDoEnsaio({ NEXT_PUBLIC_SUPABASE_URL: `https://${REF_INVENTADO}.supabase.co` })
    expect(() => confereAmbienteDeEnsaio(env)).toThrow(/lista de permiss/)
  })

  it('aceita o ref do ENSAIO', () => {
    const { url, ref } = confereAmbienteDeEnsaio(envDoEnsaio())
    expect(ref).toBe(REF_ENSAIO)
    expect(url).toContain(REF_ENSAIO)
  })

  it('SMOKE_SUPABASE_URL de produção + NEXT_PUBLIC do ensaio → usa o ENSAIO (SMOKE_* é ignorada)', () => {
    const env = envDoEnsaio({
      // `EnvSmokeImport` tem índice `[chave: string]: string | undefined` de
      // propósito (para aceitar o `.env.local` real, que TEM essas variáveis —
      // fato 37 — sem checagem de excesso de propriedade); nenhum `@ts-expect-error`
      // cabe aqui, e é exatamente ISSO que prova que a proteção não é de TIPO, é de
      // COMPORTAMENTO (a função nunca lê a chave).
      SMOKE_SUPABASE_URL: `https://${REF_PRODUCAO}.supabase.co`,
    })
    const { ref } = confereAmbienteDeEnsaio(env)
    expect(ref).toBe(REF_ENSAIO)
  })

  it('NEXT_PUBLIC de produção + SMOKE_* de ensaio → RECUSA (NEXT_PUBLIC decide, nunca SMOKE_*)', () => {
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: `https://${REF_PRODUCAO}.supabase.co`,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-de-producao-ficticia',
      SUPABASE_SERVICE_ROLE_KEY: 'service-de-producao-ficticia',
      SMOKE_SUPABASE_URL: `https://${REF_ENSAIO}.supabase.co`,
      SMOKE_EMAIL: 'conta-ficticia-de-teste@exemplo.invalido',
      SMOKE_SENHA: 'ficticia',
    }
    expect(() => confereAmbienteDeEnsaio(env)).toThrow(/PRODUÇÃO/)
  })

  it('sem SUPABASE_SERVICE_ROLE_KEY → recusa (a persona não pode ser criada sem ela)', () => {
    const env = envDoEnsaio({ SUPABASE_SERVICE_ROLE_KEY: undefined })
    expect(() => confereAmbienteDeEnsaio(env)).toThrow(/SERVICE_ROLE_KEY/)
  })

  it('sem NEXT_PUBLIC_SUPABASE_ANON_KEY → recusa', () => {
    const env = envDoEnsaio({ NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined })
    expect(() => confereAmbienteDeEnsaio(env)).toThrow(/ANON_KEY/)
  })

  it('sem NEXT_PUBLIC_SUPABASE_URL → recusa', () => {
    const env = envDoEnsaio({ NEXT_PUBLIC_SUPABASE_URL: undefined })
    expect(() => confereAmbienteDeEnsaio(env)).toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
  })

  it('URL malformada (nem parseia) → recusa como inválida, não como "fora da lista"', () => {
    const env = envDoEnsaio({ NEXT_PUBLIC_SUPABASE_URL: 'nao e uma url' })
    expect(() => confereAmbienteDeEnsaio(env)).toThrow(/inválida/)
  })

  it('URL bem formada mas de outro host (não é Supabase) → recusa pela lista de permissão', () => {
    // `refFromUrl` (scripts/env-guard.ts) extrai o primeiro rótulo do host de
    // QUALQUER URL válida — não confere que o host termine em `.supabase.co`. Um
    // host estranho ainda produz um "ref" (a primeira label), que simplesmente não
    // está em REFS_DE_ENSAIO nem em REFS_DE_PRODUCAO_CONHECIDOS: a recusa vem pela
    // mesma régua de "ref inventado", e é comportamento herdado (não desta guarda).
    const env = envDoEnsaio({ NEXT_PUBLIC_SUPABASE_URL: 'https://exemplo.invalido/nao-e-supabase' })
    expect(() => confereAmbienteDeEnsaio(env)).toThrow(/lista de permiss/)
  })

  it('NUNCA lê nenhuma chave SMOKE_* do objeto — provado por Proxy, não só por inferência', () => {
    let acessouSmoke = false
    const alvo = envDoEnsaio({
      // Mesma razão do teste acima: simula o `.env.local` real, aceito pelo índice
      // do tipo sem checagem de excesso de propriedade.
      SMOKE_SUPABASE_URL: `https://${REF_PRODUCAO}.supabase.co`,
      SMOKE_EMAIL: 'conta-ficticia@exemplo.invalido',
      SMOKE_SENHA: 'ficticia',
    })
    const env = new Proxy(alvo, {
      get(alvoInterno, prop, receptor) {
        if (typeof prop === 'string' && prop.startsWith('SMOKE_')) acessouSmoke = true
        return Reflect.get(alvoInterno, prop, receptor)
      },
    })
    confereAmbienteDeEnsaio(env)
    expect(acessouSmoke).toBe(false)
  })
})

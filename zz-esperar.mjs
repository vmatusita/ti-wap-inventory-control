// Espera o ENSAIO voltar a responder consulta, e diz o estado das filiais.
// A chave entra pelo `--env-file`; a saída imprime só HTTP, id, slug e booleano.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const ENSAIO = 'sgmvldiizsrjbxzzpmhh'
const ref = /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(url)?.[1] ?? '(irreconhecível)'
if (!url || !chave || ref !== ENSAIO) {
  console.log(`ABORTADO: alvo \`${ref}\` ou credencial ausente`)
  process.exit(1)
}
const H = { apikey: chave, Authorization: `Bearer ${chave}` }
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

for (let i = 1; i <= 60; i++) {
  const t0 = Date.now()
  let linha
  try {
    const r = await fetch(`${url}/rest/v1/filiais?select=id,slug,ativo&order=id`, {
      headers: H,
      signal: AbortSignal.timeout(20000),
    })
    const ms = Date.now() - t0
    if (r.ok) {
      const fs = await r.json()
      console.log(`[${i}] HTTP ${r.status} em ${ms}ms — VIVO`)
      for (const f of fs) console.log(`      id=${f.id}  ${String(f.slug).padEnd(16)} ativo=${f.ativo}`)
      const inativas = fs.filter((f) => !f.ativo).map((f) => f.slug)
      console.log(`      INATIVAS: ${inativas.length ? inativas.join(', ') : '(nenhuma)'}`)
      process.exit(0)
    }
    linha = `HTTP ${r.status} em ${ms}ms`
  } catch (e) {
    linha = `${e?.name ?? 'erro'} em ${Date.now() - t0}ms`
  }
  console.log(`[${i}] ${linha}`)
  await dormir(120000)
}
console.log('DESISTI: o ensaio não voltou em 2 horas')
process.exit(2)

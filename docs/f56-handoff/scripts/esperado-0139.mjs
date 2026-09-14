import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
// F56 · handoff — impressões esperadas da migration 0139 para conferir o apply (ensaio/produção).
// Rode na RAIZ do repositório: `node docs/f56-handoff/scripts/esperado-0139.mjs`.
// Compare com a consulta de verificação de docs/f56-evidencias/P1-apply-0139-ensaio.txt.
import { corpoVigente } from '../../../scripts/db/corpo-vigente.mjs'
const raiz = process.cwd()
const md5 = (s) => createHash('md5').update(s).digest('hex')
for (const sig of ['public.vocabulario_chave(text)', 'public.vocabulario_unidades_guarda()']) {
  const { sql, arquivo } = corpoVigente(sig, raiz)
  const m = sql.match(/\$\$([\s\S]*)\$\$/)
  const corpo = m[1]
  console.log('prosrc', sig, arquivo, 'len', corpo.length, 'md5norm', md5(corpo.replace(/\s+/g, ' ')))
}
const f = readFileSync(raiz + '/supabase/migrations/0139_vocabulario_import.sql', 'utf8')
const bloco = (ini, fim) => f.slice(f.indexOf(ini), f.indexOf(fim, f.indexOf(ini)))
// apelidos (slug|apelido), ordem por slug, apelido em collate "C"
const ap = [...bloco("insert into public.unidades_apelidos", "join public.filiais").matchAll(/\('([a-z-]+)',\s*'([^']+)'\)/g)].map((x) => `${x[1]}|${x[2]}`)
ap.sort()
console.log('apelidos', ap.length, md5(ap.join(';')))
const cat = [...bloco("insert into public.import_termos_categoria", ";\n").matchAll(/\('([^']+)',\s*'([^']+)',\s*'([^']+)'\)/g)].map((x) => `${x[1]}|${x[2]}|${x[3]}`)
cat.sort(); console.log('categorias', cat.length, md5(cat.join(';')))
const est = [...bloco("insert into public.import_termos_estado", ";\n").matchAll(/\('([^']+)',\s*'([^']+)',\s*(?:'([^']+)'|null)\)/g)].map((x) => `${x[1]}|${x[2]}|${x[3] ?? '-'}`)
est.sort(); console.log('estados', est.length, md5(est.join(';')))
const pre = [...bloco("insert into public.import_prefixos_patrimonio", ";\n").matchAll(/\('([A-Z]+)'\)/g)].map((x) => x[1])
pre.sort(); console.log('prefixos', pre.length, md5(pre.join(';')))
const c = f.match(/comment on column public\.eventos_admin\.acao is\s*\n\s*'((?:[^']|'')*)'/)
const texto = c[1].replace(/''/g, "'")
console.log('comment acao len', texto.length, 'md5', md5(texto))

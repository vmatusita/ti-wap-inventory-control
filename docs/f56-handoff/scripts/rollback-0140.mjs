import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
// F56 · handoff — o SQL da ORDEM DE ROLLBACK da migration 0140, gerado dos arquivos (nunca colado à mão).
// Rode na RAIZ do repositório:
//   node docs/f56-handoff/scripts/rollback-0140.mjs            → o rollback de verdade (create or replace
//                                                                 dos corpos da 0131/0132 + revoke/grant)
//   node docs/f56-handoff/scripts/rollback-0140.mjs --ensaio   → o mesmo SQL dentro de um `do $…$` que termina
//                                                                 em `raise exception` proposital: lê os md5 de
//                                                                 DENTRO da transação e desfaz tudo.
// Antes de imprimir, confere o md5 normalizado de cada corpo contra o que produção/ensaio tinham ANTES da 0140
// (P0-sonda-paridade-antes-do-apply.txt). Divergiu → sai 1 sem imprimir SQL.
// Ensaio executado em 14/09/2026: docs/f56-evidencias/P2-apply-0140-ensaio.txt.
import { definicoesDeFuncao } from '../../../scripts/db/corpo-vigente.mjs'

const pasta = process.cwd() + '/supabase/migrations/'
const arquivo = (prefixo) => readdirSync(pasta).find((f) => f.startsWith(prefixo + '_'))
const md5 = (s) => createHash('md5').update(s).digest('hex')

const ALVOS = [
  ['0131', 'import_apagar_acervo_filial', 'e313d1feb28b33ee29436e81c2ae1a70'],
  ['0131', 'import_revalidar_contagens', '3ad2f66b50aab234a579b74a154600f0'],
  ['0132', 'importar_ativos_substituir', '8ab118c36b7ba00ab8647445a52d89a1'],
]

const comandos = []
for (const [prefixo, nome, esperado] of ALVOS) {
  const arq = arquivo(prefixo)
  const defs = definicoesDeFuncao(readFileSync(pasta + arq, 'utf8')).filter((d) => d.nome === nome)
  const def = defs[defs.length - 1]
  const corpo = def.texto.match(/\$\$([\s\S]*)\$\$/)[1]
  const obtido = md5(corpo.replace(/\s+/g, ' '))
  if (obtido !== esperado) {
    console.error(`rollback-0140: ${nome} em ${arq} tem md5 ${obtido}, esperado ${esperado} — não imprimo SQL.`)
    process.exit(1)
  }
  comandos.push(def.texto.trim().endsWith(';') ? def.texto.trim() : def.texto.trim() + ';')
}

const grants = String.raw`revoke all on function public.import_apagar_acervo_filial(smallint) from public, anon, authenticated, service_role;
revoke all on function public.import_revalidar_contagens(jsonb, smallint) from public, anon, authenticated, service_role;
revoke all on function public.importar_ativos_substituir(jsonb, text, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.importar_ativos_substituir(jsonb, text, jsonb, jsonb) to authenticated;`

const sonda = String.raw`select string_agg(p.proname || '=' || md5(regexp_replace(p.prosrc, '\s+', ' ', 'g')), ' ; ' order by p.proname)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('importar_ativos_substituir','import_apagar_acervo_filial','import_revalidar_contagens')`

if (process.argv.includes('--ensaio')) {
  console.log(`do $ensaio_rollback_0140$
declare v_md5 text;
begin
${comandos.join('\n\n')}

${grants}

${sonda}
  into v_md5;
raise exception 'ENSAIO-ROLLBACK-0140 dentro da transacao: md5s [%] (excecao proposital: tudo desfeito)', v_md5;
end $ensaio_rollback_0140$;`)
} else {
  console.log(`-- ROLLBACK da 0140 (F56 · Frente F): volta aos corpos da 0131/0132. Não toca dado.
begin;

${comandos.join('\n\n')}

${grants}

commit;

-- conferência: esperado e313d1fe… / 3ad2f66b… / 8ab118c3…
${sonda};

notify pgrst, 'reload schema';`)
}

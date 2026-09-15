// Resume uma rodada do conferidor (JSON) num texto legível para `docs/f58-evidencias/` — só contagens, códigos e
// caminhos normalizados, exatamente o que o JSON já traz. Nenhum valor é lido do banco aqui.
//
// USO: node resumir-conferidor.mjs <rodada.json> <saida.txt> "<título da rodada>"
import { readFileSync, writeFileSync } from 'node:fs'

const [entrada, saida, titulo] = process.argv.slice(2)
if (!entrada || !saida || !titulo) {
  console.error('uso: node resumir-conferidor.mjs <rodada.json> <saida.txt> "<título>"')
  process.exit(2)
}
const r = JSON.parse(readFileSync(entrada, 'utf8'))
const pontos = r.pontos ?? []
const ehRpc = (p) => p.ponto.includes(' · ')
const reprova = (p) => p.recusadas > 0 || p.erros.length > 0 || p.nao_provado || (p.count !== null && p.lidas !== p.count)

const l = []
l.push(`# F58 · Conferidor de formas — ${titulo}`)
l.push(`# alvo ${r.alvo} · HEAD ${r.sha} · árvore limpa em src/scripts: ${r.arvore_limpa_em_src_scripts} · ${r.inicio} → ${r.fim}`)
l.push('# só contagens e caminhos normalizados — nenhum valor, id, slug, e-mail ou patrimônio')
l.push('')
l.push('## Totais')
l.push(`pontos ................ ${r.totais.pontos} (${pontos.filter((p) => !ehRpc(p)).length} relações, ${pontos.filter(ehRpc).length} células de RPC)`)
l.push(`linhas lidas .......... ${r.totais.linhas_lidas}`)
l.push(`recusadas ............. ${r.totais.recusadas}`)
l.push(`pontos com erro ....... ${r.totais.com_erro}`)
l.push(`lidas ≠ count exato ... ${pontos.filter((p) => p.count !== null && p.lidas !== p.count).length}`)
l.push(`reprovados ............ ${r.totais.reprovados}`)
l.push(`recibos provados pelo SQL e NÃO chamados: ${(r.recibos_provados_pelo_sql_e_nao_chamados ?? []).join(', ') || '—'}`)
if (r.descritores_sem_linha_no_alvo) l.push(`descritores sem linha no alvo (forma não exercitada aqui): ${r.descritores_sem_linha_no_alvo.join(', ') || '—'}`)
l.push(`ordem provada pela chave primária no banco (coluna fora do select): ${pontos.filter((p) => p.ordem_provada).length} relação(ões)`)
l.push('')
l.push('## Reprovados')
const rep = pontos.filter(reprova)
if (rep.length === 0) l.push('nenhum')
for (const p of rep) {
  l.push(`- ${p.ponto} · lidas ${p.lidas} · count ${p.count ?? '—'} · recusadas ${p.recusadas}`)
  for (const e of p.erros) l.push(`    erro: ${e}`)
  if (p.nao_provado) l.push(`    NÃO PROVADO: ${p.nao_provado}`)
  for (const pr of p.problemas) l.push(`    ${pr.caminho} ${pr.codigo} ×${pr.ocorrencias}`)
}
l.push('')
l.push('## Relações, por ponto')
l.push('| ponto | lidas | count | recusadas |')
l.push('|---|---:|---:|---:|')
for (const p of pontos.filter((x) => !ehRpc(x))) l.push(`| ${p.ponto} | ${p.lidas} | ${p.count ?? '—'} | ${p.recusadas} |`)
l.push('')
l.push('## RPCs de leitura, por descritor (a grade de argumentos — células rotuladas por número de ordem)')
const porRpc = new Map()
for (const p of pontos.filter(ehRpc)) {
  const k = p.ponto.split(' · ')[0]
  const v = porRpc.get(k) ?? { celulas: 0, lidas: 0, recusadas: 0, erros: 0, vazias: 0 }
  v.celulas++
  v.lidas += p.lidas
  v.recusadas += p.recusadas
  v.erros += p.erros.length
  if (p.lidas === 0) v.vazias++
  porRpc.set(k, v)
}
l.push('| descritor | células | células sem linha | linhas | recusadas | erros |')
l.push('|---|---:|---:|---:|---:|---:|')
for (const [k, v] of porRpc) l.push(`| ${k} | ${v.celulas} | ${v.vazias} | ${v.lidas} | ${v.recusadas} | ${v.erros} |`)
writeFileSync(saida, l.join('\n') + '\n')
console.log(`ok — ${saida} (${pontos.length} pontos)`)

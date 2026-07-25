// Compatibilidade com a ajuda de PAGINA UNICA (F6B → F19). Duas coisas moram
// aqui, e as duas são contrato externo:
//
// 1. `DESTINO_LEGADO` e `resolverDestinoLegado` — para onde vai cada
//    `/ajuda#<id-antigo>` que ainda existe em favorito, histórico do navegador e
//    link colado em chamado. Eles MORAM em `ancora.ts` (puro, porque quem
//    redireciona é o cliente) e aqui são apenas REEXPORTADOS, já que este é o
//    módulo do "legado".
//
// 2. SECOES — a VISÃO DE COMPATIBILIDADE. Cada página declara `legado: [...]`
//    com as seções antigas cujo conteúdo ela herdou; aqui as páginas são
//    remontadas naquelas 10 seções. Serve a um propósito só, e é o guarda-corpo
//    da F20: `conteudo.test.ts` (22 KB de asserções acumuladas da F9 à F18)
//    continua rodando sobre esta visão com UMA linha alterada na fase inteira
//    (e para mais forte: uma asserção virou duas — ver o commit). Se uma frase do
//    manual antigo desaparecer na reorganização, aquele teste falha — ninguém
//    precisa lembrar dela. Reorganizar ≠ apagar, provado pelo build.
import { PAGINAS } from '@/lib/ajuda/registry'
import { textoDoBloco } from '@/lib/ajuda/indice'
import { normalizarBusca } from '@/lib/ajuda/busca'
import type { Secao, SecaoLegada } from '@/lib/ajuda/tipos'

// O MAPA e a função de resolução moram em `ancora.ts`, que é PURO. Motivo de
// arquitetura: quem redireciona é o CLIENTE (o hash nunca chega ao servidor) e
// este arquivo importa o registry, que é só-servidor. Reexportados aqui porque
// é este o módulo do "legado" — e para nada quebrar de quem já importava daqui.
export { DESTINO_LEGADO, resolverDestinoLegado } from '@/lib/ajuda/ancora'

const TITULO_LEGADO: Readonly<Record<SecaoLegada, string>> = {
  conceito: 'Conceito: a movimentação é a fonte da verdade',
  status: 'Status do ativo',
  movimentacoes: 'Tipos de movimentação',
  termos: 'Termos de responsabilidade',
  itens: 'Itens por quantidade',
  pendencias: 'Pendências',
  relatorios: 'Relatórios e snapshots',
  'como-fazer': 'Como fazer (passo a passo)',
  admin: 'Administração',
  acesso: 'Acesso e sessões',
}

export const IDS_LEGADOS = Object.keys(TITULO_LEGADO) as SecaoLegada[]

/** A visão de compatibilidade: as 10 seções do manual antigo, remontadas. */
export const SECOES: Secao[] = IDS_LEGADOS.map((id) => ({
  id,
  titulo: TITULO_LEGADO[id],
  blocos: PAGINAS.filter((p) => p.legado?.includes(id)).flatMap((p) => p.blocos),
}))

export function textoDaSecao(secao: Secao): string {
  const bruto = [secao.titulo, ...secao.blocos.map(textoDoBloco)].join(' ')
  return normalizarBusca(bruto)
}

export function filtrarSecoes(secoes: Secao[], consulta: string): Secao[] {
  const q = normalizarBusca(consulta)
  if (!q) return secoes
  return secoes.filter((s) => textoDaSecao(s).includes(q))
}

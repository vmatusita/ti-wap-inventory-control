// Registry da documentacao do operador (F20). UMA lista ordenada de paginas
// alimenta as rotas, o indice, a busca, o manual imprimivel e os testes — não
// existe segunda fonte.
//
// TRAP DE ARQUITETURA (herdado da F6B e ampliado aqui): este modulo é
// SO-SERVIDOR. Os tetos citados na documentacao vêm das constantes reais e
// `@/lib/csv` arrasta o PapaParse; `dominio.ts` arrasta a camada de dominio
// inteira. Client Component NUNCA importa daqui — recebe por prop o que o
// servidor serializar (`indicePaleta()` em `indice.ts`). Para tipos, use
// `@/lib/ajuda/tipos`, que não importa nada de servidor.
//
// A ORDEM do array é o sitemap: manda no índice, no anterior/próxima, no manual
// imprimível e na montagem da visão de compatibilidade (`legado.ts`).
import type { CategoriaAjuda, PaginaAjuda } from '@/lib/ajuda/tipos'

import { comeceAqui } from '@/lib/ajuda/conteudo/comece-aqui'
import { conceitoMovimentacao } from '@/lib/ajuda/conteudo/conceito-movimentacao'
import { identidadeDoEquipamento } from '@/lib/ajuda/conteudo/identidade-do-equipamento'
import { acessoESessoes } from '@/lib/ajuda/conteudo/acesso-e-sessoes'
import { mapaDasTelas } from '@/lib/ajuda/conteudo/mapa-das-telas'

import { registrarMovimentacao } from '@/lib/ajuda/conteudo/registrar-movimentacao'
import { colarEBiparLote } from '@/lib/ajuda/conteudo/colar-e-bipar-lote'
import { kitsDeMovimentacao } from '@/lib/ajuda/conteudo/kits-de-movimentacao'
import { entregarEmprestarReservar } from '@/lib/ajuda/conteudo/entregar-emprestar-reservar'
import { devolucaoETriagem } from '@/lib/ajuda/conteudo/devolucao-e-triagem'
import { manutencao } from '@/lib/ajuda/conteudo/manutencao'
import { transferirDefasarDescartar } from '@/lib/ajuda/conteudo/transferir-defasar-descartar'
import { corrigirEstornoAjuste } from '@/lib/ajuda/conteudo/corrigir-estorno-ajuste'
import { cadastrarCompra } from '@/lib/ajuda/conteudo/cadastrar-compra'
import { termosDeResponsabilidade } from '@/lib/ajuda/conteudo/termos-de-responsabilidade'

import { fichaDoAtivo } from '@/lib/ajuda/conteudo/ficha-do-ativo'
import { listaDeAtivos } from '@/lib/ajuda/conteudo/lista-de-ativos'
import { listaDeMovimentacoes } from '@/lib/ajuda/conteudo/lista-de-movimentacoes'
import { lancarItens } from '@/lib/ajuda/conteudo/lancar-itens'
import { saldosEEstoqueMinimo } from '@/lib/ajuda/conteudo/saldos-e-estoque-minimo'
import { conferenciaDeEstoque } from '@/lib/ajuda/conteudo/conferencia-de-estoque'
import { resolverPendencias } from '@/lib/ajuda/conteudo/resolver-pendencias'
import { administracao } from '@/lib/ajuda/conteudo/administracao'
import { usuariosESenhas } from '@/lib/ajuda/conteudo/usuarios-e-senhas'
import { importDeStartup } from '@/lib/ajuda/conteudo/import-de-startup'

import { relatorioAoVivo } from '@/lib/ajuda/conteudo/relatorio-ao-vivo'
import { relatoriosGerados } from '@/lib/ajuda/conteudo/relatorios-gerados'
import { statusDoAtivo } from '@/lib/ajuda/conteudo/status-do-ativo'
import { tiposDeMovimentacao } from '@/lib/ajuda/conteudo/tipos-de-movimentacao'
import { itensPorQuantidade } from '@/lib/ajuda/conteudo/itens-por-quantidade'
import { limitesEAtalhos } from '@/lib/ajuda/conteudo/limites-e-atalhos'
import { versoesDoSistema } from '@/lib/ajuda/conteudo/versoes-do-sistema'
import { mensagensDeErro } from '@/lib/ajuda/conteudo/mensagens-de-erro'

import { problemasComuns } from '@/lib/ajuda/conteudo/problemas-comuns'
import { problemasImportEAcesso } from '@/lib/ajuda/conteudo/problemas-import-e-acesso'

export const PAGINAS: readonly PaginaAjuda[] = [
  // Comece aqui
  comeceAqui,
  conceitoMovimentacao,
  identidadeDoEquipamento,
  acessoESessoes,
  mapaDasTelas,
  // Como fazer — operação de ativos
  registrarMovimentacao,
  colarEBiparLote,
  kitsDeMovimentacao,
  entregarEmprestarReservar,
  devolucaoETriagem,
  manutencao,
  transferirDefasarDescartar,
  corrigirEstornoAjuste,
  cadastrarCompra,
  termosDeResponsabilidade,
  // Como fazer — consultas, itens, pendências e administração
  fichaDoAtivo,
  listaDeAtivos,
  listaDeMovimentacoes,
  lancarItens,
  saldosEEstoqueMinimo,
  conferenciaDeEstoque,
  resolverPendencias,
  administracao,
  usuariosESenhas,
  importDeStartup,
  // Consultar
  relatorioAoVivo,
  relatoriosGerados,
  statusDoAtivo,
  tiposDeMovimentacao,
  itensPorQuantidade,
  limitesEAtalhos,
  versoesDoSistema,
  mensagensDeErro,
  // Resolver
  problemasComuns,
  problemasImportEAcesso,
]

export const CATEGORIAS: readonly {
  chave: CategoriaAjuda
  rotulo: string
  descricao: string
}[] = [
  {
    chave: 'comecar',
    rotulo: 'Comece aqui',
    descricao: 'O essencial para entender o sistema antes de operar.',
  },
  {
    chave: 'fazer',
    rotulo: 'Como fazer',
    descricao: 'Um passo a passo para cada tarefa do dia.',
  },
  {
    chave: 'consultar',
    rotulo: 'Consultar',
    descricao: 'Glossários, limites e o significado de cada coisa na tela.',
  },
  {
    chave: 'resolver',
    rotulo: 'Resolver',
    descricao: 'Sintoma, causa e saída quando algo não funciona como esperado.',
  },
]

/**
 * Slugs que o motor usa como rota própria — nenhuma página pode reivindicá-los.
 * Só entra aqui o que EXISTE como rota estática sob /ajuda: hoje, `manual`
 * (`src/app/(app)/ajuda/manual/page.tsx`). `indice` e `busca` estavam na lista
 * sem rota nenhuma por trás, barrando dois nomes legítimos de página em nome de
 * uma colisão impossível (achado da revisão dos 8 commits da F20).
 */
export const SLUGS_RESERVADOS: readonly string[] = ['manual']

export function paginaPorSlug(slug: string): PaginaAjuda | undefined {
  return PAGINAS.find((p) => p.slug === slug)
}

export function paginasDaCategoria(categoria: CategoriaAjuda): PaginaAjuda[] {
  return PAGINAS.filter((p) => p.categoria === categoria)
}

/** Âncoras internas (blocos `titulo`) — alimentam o sumário da página. */
export function ancorasDaPagina(pagina: PaginaAjuda): { id: string; texto: string }[] {
  return pagina.blocos.flatMap((b) => (b.tipo === 'titulo' ? [{ id: b.id, texto: b.texto }] : []))
}

/**
 * Vizinhas DENTRO da categoria (navegação anterior/próxima do rodapé da página).
 * Fora da categoria não há vizinha: pular de "Resolver" para "Comece aqui" com
 * um botão "próxima" seria mentira de contexto.
 */
export function vizinhas(slug: string): {
  anterior: PaginaAjuda | null
  proxima: PaginaAjuda | null
} {
  const pagina = paginaPorSlug(slug)
  if (!pagina) return { anterior: null, proxima: null }
  const irmas = paginasDaCategoria(pagina.categoria)
  const i = irmas.findIndex((p) => p.slug === slug)
  return {
    anterior: i > 0 ? irmas[i - 1] : null,
    proxima: i >= 0 && i < irmas.length - 1 ? irmas[i + 1] : null,
  }
}

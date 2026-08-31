import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { PAGINAS, ancorasDaPagina, paginaPorSlug } from '@/lib/ajuda/registry'
import { textoDaPagina } from '@/lib/ajuda/indice'
import { normalizarBusca } from '@/lib/ajuda/busca'
import type { Bloco, PaginaAjuda } from '@/lib/ajuda/tipos'
import { ROTULO_TIPO_PENDENCIA, type TipoPendencia } from '@/lib/pendencias/rotulos'
import {
  DESFECHOS_PENDENCIA_ITEM,
  DESFECHO_PENDENCIA_ITEM_ROTULO,
  TIPO_LANCAMENTO_META,
  type TipoLancamento,
} from '@/lib/dominio'
import { MAX_LINHAS_LOTE_ITEM, MAX_LINHAS_TRANSFERENCIA_ITEM } from '@/lib/validators/item'
import { MAX_LOTE_MOVIMENTACAO } from '@/lib/validators/movimentacao'
import { CAP_EXPORT } from '@/lib/csv'
import { TAMANHOS_PAGINA, TAMANHO_PAGINA_PADRAO } from '@/lib/ativos/lista'
import { DOMINIOS_TEXTO } from '@/lib/auth/dominios-email'
import {
  PAPEIS,
  PAPEL_DESCRICAO,
  PAPEL_ROTULO,
  type PapelUsuario,
} from '@/lib/auth/papeis'
import { ACOES_ADMIN, ACAO_ROTULO } from '@/lib/auditoria'
import { TAMANHO_MAX_ROTULO } from '@/lib/import/limites'

// Testes de COMPLETUDE da frente "consultas, itens, pendências e administração"
// (F20 · C3). Eles travam o que estas nove páginas afirmam sobre a tela real:
// se um rótulo sair do app, ou uma capacidade documentada desaparecer do texto,
// o build de testes cai antes de a documentação virar mentira.
//
// Testes só crescem: nenhuma asserção daqui pode ser afrouxada em fase futura —
// só substituída por outra mais forte quando o COMPORTAMENTO mudar de verdade.

const SLUGS_C3 = [
  'ficha-do-ativo',
  'lista-de-ativos',
  'lista-de-movimentacoes',
  'lancar-itens',
  'saldos-e-estoque-minimo',
  // F31 · ITN-04 — a conferência entra na MESMA régua estrutural das outras oito
  // (categoria "fazer", fecha em links, corpo de verdade, âncoras únicas no
  // projeto inteiro). Página nova que não entrasse aqui nasceria sem rede.
  'conferencia-de-estoque',
  'resolver-pendencias',
  'administracao',
  'usuarios-e-senhas',
  'import-de-startup',
] as const

function pagina(slug: string): PaginaAjuda {
  const p = paginaPorSlug(slug)
  if (!p) throw new Error(`Página não encontrada no registry: ${slug}`)
  return p
}

/** Texto completo da página, já normalizado (mesma régua da busca). */
function texto(slug: string): string {
  return textoDaPagina(pagina(slug))
}

function contem(slug: string, trecho: string): void {
  expect(texto(slug), `${slug} deveria citar "${trecho}"`).toContain(
    normalizarBusca(trecho),
  )
}

function titulosDePassos(slug: string): string[] {
  return pagina(slug)
    .blocos.filter((b): b is Extract<Bloco, { tipo: 'passos' }> => b.tipo === 'passos')
    .map((b) => b.titulo ?? '')
}

// ---------------------------------------------------------------------------
// Estrutura: as nove páginas existem e seguem a régua do §6 do PLANO-AJUDA.
// ---------------------------------------------------------------------------

describe('as nove páginas da frente existem e estão inteiras', () => {
  it('todas estão no registry, na categoria "fazer"', () => {
    for (const slug of SLUGS_C3) {
      expect(pagina(slug).categoria, slug).toBe('fazer')
    }
  })

  it('toda página fecha com um bloco de links (régua §6.6)', () => {
    for (const slug of SLUGS_C3) {
      const blocos = pagina(slug).blocos
      expect(blocos[blocos.length - 1]?.tipo, `${slug} não termina em links`).toBe('links')
    }
  })

  it('toda página tem corpo de verdade (não é esboço)', () => {
    for (const slug of SLUGS_C3) {
      expect(texto(slug).length, `${slug} está curta demais`).toBeGreaterThan(1200)
    }
  })

  it('as duas páginas que nasceram vazias ganharam guia completo', () => {
    // usuarios-e-senhas e import-de-startup eram um parágrafo cada (inventário I-A).
    for (const slug of ['usuarios-e-senhas', 'import-de-startup']) {
      expect(titulosDePassos(slug).length, `${slug} sem passo a passo`).toBeGreaterThanOrEqual(3)
      expect(
        ancorasDaPagina(pagina(slug)).length,
        `${slug} sem sumário`,
      ).toBeGreaterThanOrEqual(3)
    }
  })

  it('nenhuma página emite um título de passos (h3) antes do primeiro título (h2)', () => {
    // /ajuda/<slug>: o h1 é o título da página, bloco 'titulo' vira h2 e o título
    // de 'passos' vira h3 (bloco-ajuda.tsx). Um passo antes do primeiro 'titulo'
    // produzia h1 → h3 → h2 e deixava a seção fora do sumário "Nesta página".
    for (const slug of SLUGS_C3) {
      const blocos = pagina(slug).blocos
      const primeiroTitulo = blocos.findIndex((b) => b.tipo === 'titulo')
      const primeiroPasso = blocos.findIndex((b) => b.tipo === 'passos' && !!b.titulo)
      if (primeiroPasso === -1) continue
      expect(primeiroTitulo, `${slug} não tem bloco 'titulo'`).toBeGreaterThanOrEqual(0)
      expect(
        primeiroTitulo,
        `${slug}: passos com título antes do primeiro 'titulo' (h3 antes de h2)`,
      ).toBeLessThan(primeiroPasso)
    }
  })

  it('as âncoras destas páginas são únicas no projeto inteiro', () => {
    const minhas = SLUGS_C3.flatMap((s) => ancorasDaPagina(pagina(s)).map((a) => a.id))
    const outras = PAGINAS.filter(
      (p) => !(SLUGS_C3 as readonly string[]).includes(p.slug),
    ).flatMap((p) => ancorasDaPagina(p).map((a) => a.id))
    expect(new Set(minhas).size).toBe(minhas.length)
    for (const id of minhas) {
      expect(outras, `âncora repetida com outra frente: ${id}`).not.toContain(id)
    }
  })
})

// ---------------------------------------------------------------------------
// REGRA DE OURO — nada de rótulo/teto digitado à mão.
// ---------------------------------------------------------------------------

describe('derivação (nenhum rótulo nem teto digitado à mão)', () => {
  it('o glossário de pendências cobre TODOS os buckets, com o rótulo real', () => {
    const glossario = pagina('resolver-pendencias').blocos.find(
      (b): b is Extract<Bloco, { tipo: 'glossario' }> => b.tipo === 'glossario',
    )
    expect(glossario).toBeDefined()
    const chaves = glossario!.itens.map((v) => v.chave).sort()
    expect(chaves).toEqual(Object.keys(ROTULO_TIPO_PENDENCIA).sort())
    for (const v of glossario!.itens) {
      // Rótulo divergente = a doc chamaria o selo da tabela por outro nome.
      expect(v.rotulo).toBe(ROTULO_TIPO_PENDENCIA[v.chave as TipoPendencia])
      expect(v.descricao.length, `bucket sem prosa: ${v.chave}`).toBeGreaterThan(40)
    }
  })

  // ⚠ O array de numerais AQUI é o espelho do `POR_EXTENSO` da página, e precisa acompanhar
  // cada tipo novo: com 6 tipos, um array de 6 posições devolve `undefined` no índice 6 e a
  // asserção passa a procurar a string literal "undefined tipos". A página se vira sozinha
  // (o POR_EXTENSO dela vai até "dez"); quem não se vira é este teste.
  it('o glossário nomeia todos os tipos e o numeral da prosa acompanha (F24: seis)', () => {
    contem('resolver-pendencias', ROTULO_TIPO_PENDENCIA.patrimonio)
    contem('resolver-pendencias', ROTULO_TIPO_PENDENCIA.conflito)
    contem('resolver-pendencias', `${['zero','um','dois','três','quatro','Cinco','Seis','Sete','Oito','Nove','Dez'][Object.keys(ROTULO_TIPO_PENDENCIA).length]} tipos`)
  })

  it('os seis tipos de lançamento vêm de dominio.ts', () => {
    for (const t of Object.keys(TIPO_LANCAMENTO_META) as TipoLancamento[]) {
      contem('lancar-itens', TIPO_LANCAMENTO_META[t].rotulo)
    }
  })

  it('o par que exige chamado é Atrelar/Devolução — nunca "Liberação"', () => {
    // `exigeChamado` (validators/item.ts) = 'reserva' + 'liberacao', que na TELA
    // se chamam "Atrelar" e "Devolução". "Liberação" é o rótulo de 'saida', que
    // não pede chamado nenhum — citá-lo aqui mandava o operador ao campo errado.
    const atrelar = TIPO_LANCAMENTO_META.reserva.rotulo
    const devolucao = TIPO_LANCAMENTO_META.liberacao.rotulo
    contem('lancar-itens', `${atrelar}/${devolucao}`)
    contem('lancar-itens', `${atrelar} e ${devolucao} exigem o número do chamado`)
    expect(texto('lancar-itens')).not.toContain(
      normalizarBusca(`${atrelar}/${TIPO_LANCAMENTO_META.saida.rotulo}`),
    )
  })

  it('os dois desfechos de item faltante vêm de DESFECHO_PENDENCIA_ITEM_ROTULO', () => {
    for (const d of DESFECHOS_PENDENCIA_ITEM) {
      contem('resolver-pendencias', DESFECHO_PENDENCIA_ITEM_ROTULO[d])
    }
  })

  it('os tetos citados vêm das constantes reais', () => {
    contem('lancar-itens', `${MAX_LINHAS_LOTE_ITEM} linhas por lançamento`)
    contem('lista-de-ativos', `${CAP_EXPORT.toLocaleString('pt-BR')} linhas`)
    contem('import-de-startup', TAMANHO_MAX_ROTULO)
    contem('usuarios-e-senhas', DOMINIOS_TEXTO)
  })

  it('os tamanhos de página saem de TAMANHOS_PAGINA e do padrão real', () => {
    for (const n of TAMANHOS_PAGINA) contem('lista-de-ativos', String(n))
    contem('lista-de-ativos', `o padrão continua ${TAMANHO_PAGINA_PADRAO}`)
  })
})

// ---------------------------------------------------------------------------
// Ficha do ativo — CAP-06 · CAP-69 · CAP-72 · CAP-99 · CAP-101.
// ---------------------------------------------------------------------------

describe('ficha do ativo', () => {
  it('as ações de exceção estão no menu ⋯, não soltas na barra', () => {
    contem('ficha-do-ativo', 'Mais ações')
    contem('ficha-do-ativo', 'Corrigir patrimônio')
    contem('ficha-do-ativo', 'Definir patrimônio')
    contem('ficha-do-ativo', 'Definir service tag')
    // A instrução antiga mandava procurar um botão que saiu da barra na F19-UX.
    expect(texto('ficha-do-ativo')).not.toContain(
      normalizarBusca('Na ficha, use "Corrigir patrimônio"'),
    )
    expect(texto('ficha-do-ativo')).not.toContain(
      normalizarBusca('use "Definir service tag" na ficha'),
    )
  })

  it('cita os botões reais da barra de ações', () => {
    for (const rotulo of [
      'Nova movimentação',
      'Devolver ao fornecedor',
      'Comprar outro igual',
      'Anotar',
      'Editar dados cadastrais',
    ]) {
      contem('ficha-do-ativo', rotulo)
    }
  })

  it('descreve o vínculo de sucessão nos dois sentidos', () => {
    contem('ficha-do-ativo', 'Substitui')
    contem('ficha-do-ativo', 'Substituído por')
    contem('ficha-do-ativo', 'Histórico do ativo substituído')
  })

  it('descreve a linha do tempo com os rótulos que ela usa', () => {
    for (const rotulo of ['Motivo:', 'Destino:', 'Chamado do fornecedor:', 'Itens faltantes:']) {
      contem('ficha-do-ativo', rotulo)
    }
    contem('ficha-do-ativo', 'estornada')
    contem('ficha-do-ativo', 'Duplicar')
    // Destaque :target da linha aberta por link.
    contem('ficha-do-ativo', 'destacada')
  })

  it('mantém a regra da service tag imutável e do ativo sem plaqueta', () => {
    contem('ficha-do-ativo', 'imutável')
    contem('ficha-do-ativo', 'Sem patrimônio')
  })

  it('"Voltar para ativos" é a ÚLTIMA lista da aba, não "a lista de onde veio"', () => {
    // voltar-para-ativos.tsx lê a URL gravada em sessionStorage pela própria
    // lista (`document.referrer` + `router.back()` não funciona no App Router):
    // o destino é o último recorte visitado, que pode nem conter este ativo.
    contem('ficha-do-ativo', 'ÚLTIMA lista de Ativos que você visitou naquela aba')
    expect(texto('ficha-do-ativo')).not.toContain(normalizarBusca('lista de onde veio'))
  })

  it('o patrimônio vindo do hostname é correção automática, não aviso', () => {
    // importar-wizard.tsx filtra 'patrimonio_do_hostname' da contagem de avisos,
    // da tabela de avisos e do CSV de erros: quem procurar entre os avisos não acha.
    contem('ficha-do-ativo', 'correção automática')
    contem('ficha-do-ativo', 'preenchidos automaticamente pelo hostname')
    expect(texto('ficha-do-ativo')).not.toContain(
      normalizarBusca('é um aviso, não um erro'),
    )
  })
})

// ---------------------------------------------------------------------------
// Lista de ativos — CAP-98 · CAP-100.
// ---------------------------------------------------------------------------

describe('lista de ativos', () => {
  it('explica "Voltar para ativos" com o escopo real (a aba, a última lista)', () => {
    contem('lista-de-ativos', 'Voltar para ativos')
    contem('lista-de-ativos', 'última lista visitada')
    contem('lista-de-ativos', 'aba do navegador')
    // A âncora existe: a ficha aponta para ela.
    expect(ancorasDaPagina(pagina('lista-de-ativos')).map((a) => a.id)).toContain(
      'ativos-voltar',
    )
  })

  // ATV-03 (F30) — a seleção múltipla é a ponte entre filtrar e movimentar.
  // Sem documentação, ela é uma coluna de caixinhas que apareceu do nada.
  it('documenta a seleção múltipla, o teto e o escopo por página', () => {
    for (const frase of [
      'Movimentar',
      'Copiar patrimônios',
      'Limpar seleção',
      'PÁGINA que está aberta',
    ]) {
      contem('lista-de-ativos', frase)
    }
    // O teto vem da constante real, como manda a regra de ouro da ajuda.
    contem('lista-de-ativos', `até ${MAX_LOTE_MOVIMENTACAO} ativos`)
    expect(ancorasDaPagina(pagina('lista-de-ativos')).map((a) => a.id)).toContain(
      'ativos-selecionar',
    )
    // A restrição de cargo tem de estar escrita nos DOIS lugares em que o
    // operador procura: na página da lista e no mapa de telas.
    contem('lista-de-ativos', 'só aparecem para quem registra movimentação')
    contem('mapa-das-telas', 'caixinhas de seleção da lista de ativos')
    // E a outra ponta da ponte: quem chega no wizard precisa saber de onde veio.
    contem('registrar-movimentacao', 'marque as caixinhas das linhas')
  })

  it('distingue o vazio "não há nada" do vazio "nada bate com o filtro"', () => {
    contem('lista-de-ativos', 'Nenhum ativo cadastrado ainda')
    contem('lista-de-ativos', 'Nenhum ativo com esses filtros')
    contem('lista-de-ativos', 'Limpar filtros')
  })

  it('cita os controles reais do filtro', () => {
    for (const rotulo of ['Pesquisar', 'Todas as filiais', 'Todas categorias', 'Sem patrimônio']) {
      contem('lista-de-ativos', rotulo)
    }
  })
})

// ---------------------------------------------------------------------------
// Lista de movimentações — CAP-60 · CAP-101.
// ---------------------------------------------------------------------------

describe('lista de movimentações', () => {
  it('documenta a busca por patrimônio fora do padrão E a limitação de hoje', () => {
    contem('lista-de-movimentacoes', 'exatamente como você digitou')
    contem('lista-de-movimentacoes', 'ao menos um número')
    contem('lista-de-movimentacoes', 'SÓ por letras')
    // A limitação é estado, nunca promessa: nada de "ainda".
    expect(texto('lista-de-movimentacoes')).not.toContain(normalizarBusca('ainda nao'))
  })

  it('diz que a linha aberta por link fica destacada', () => {
    contem('lista-de-movimentacoes', 'destacada')
  })

  it('distingue os dois estados vazios', () => {
    contem('lista-de-movimentacoes', 'Nenhuma movimentação com esses filtros')
    contem('lista-de-movimentacoes', 'Nenhuma movimentação registrada ainda')
  })
})

// ---------------------------------------------------------------------------
// Itens: lançamento e saldos.
// ---------------------------------------------------------------------------

describe('lançar itens e ler saldos', () => {
  it('o estorno de lançamento é descrito como INVERSO, não como "retorno"', () => {
    contem('lancar-itens', 'lançamento inverso vinculado')
    contem('lancar-itens', 'nada é apagado')
    // O texto antigo prometia sempre um "lançamento de retorno" — o inverso
    // depende do tipo original (entrada vira ajuste negativo, etc.).
    expect(texto('lancar-itens')).not.toContain(
      normalizarBusca('gera um lançamento de retorno'),
    )
  })

  it('registra as limitações do export de saldos (estado, não promessa)', () => {
    contem('saldos-e-estoque-minimo', 'Exportar saldos')
    // ⚠ O teste FIXAVA a palavra "CONSOLIDADO" aqui, e por isso a suíte passava
    // verde enquanto a ajuda descrevia um comportamento que a revisão da F25 já
    // tinha mudado — protegendo a documentação errada em vez de detectá-la. O que
    // vale fixar é o par tela × arquivo: o export ACOMPANHA a visão.
    contem('saldos-e-estoque-minimo', 'COLUNA POR FILIAL')
    contem('saldos-e-estoque-minimo', 'o estoque mínimo não vai no arquivo')
  })

  it('mantém a distinção falta × repor com a fórmula real', () => {
    contem('saldos-e-estoque-minimo', 'Falta e repor são dois avisos DIFERENTES')
    // F41 — a conta é a mesma; 'atrelados' virou 'reservado' e 'liberados' virou 'em uso'.
    contem('saldos-e-estoque-minimo', 'máx(0, reservado + em uso − total)')
    contem('saldos-e-estoque-minimo', 'estoque somado de TODAS as filiais')
  })

  // ---- F31 · ITN-01 — transferência entre filiais ----

  it('a transferência é documentada como CAMINHO PRÓPRIO, com a âncora no lugar', () => {
    expect(ancorasDaPagina(pagina('lancar-itens')).map((a) => a.id)).toContain('transferir')
    contem('lancar-itens', 'Transferir entre filiais')
    contem('lancar-itens', 'Transferir itens entre filiais')
  })

  it('diz POR QUE o caminho intuitivo é errado, usando os rótulos reais', () => {
    // A frase tem de nomear os DOIS tipos do caminho errado e o tipo do caminho
    // certo — e pelos rótulos de `dominio.ts`, nunca digitados à mão: na tela
    // 'saida' se chama "Liberação" e 'liberacao' se chama "Devolução", e trocar
    // um pelo outro manda o operador ao campo errado (mesma armadilha que o
    // teste do par Atrelar/Devolução, acima, já trava).
    const liberacao = TIPO_LANCAMENTO_META.saida.rotulo
    const entrada = TIPO_LANCAMENTO_META.entrada.rotulo
    const ajuste = TIPO_LANCAMENTO_META.ajuste.rotulo
    contem('lancar-itens', `"${liberacao}" na origem + "${entrada}" no destino`)
    contem('lancar-itens', 'faz o total da TI CRESCER')
    contem('lancar-itens', `um "${ajuste}" para menos na origem e um para mais no destino`)
    contem('lancar-itens', 'o total continua exatamente o mesmo')
  })

  it('o teto da transferência sai da constante, e é o mesmo do lançamento', () => {
    expect(MAX_LINHAS_TRANSFERENCIA_ITEM).toBe(MAX_LINHAS_LOTE_ITEM)
    contem('lancar-itens', `até ${MAX_LINHAS_TRANSFERENCIA_ITEM} por transferência`)
  })

  it('afirma o TUDO-OU-NADA, que é o oposto do lote de lançamento', () => {
    contem('lancar-itens', 'É tudo ou nada')
    contem('lancar-itens', 'NADA é gravado')
    // E não deixa o operador achar que vale a regra do carrinho, onde cada linha
    // é independente — a página documenta as duas coisas, e elas se contradizem
    // se lidas sem a ressalva.
    contem('lancar-itens', 'diferente do lançamento em lote')
  })

  it('documenta o estorno de PERNA como escolha consciente (avisa, não impede)', () => {
    contem('lancar-itens', 'desfaz só aquele lado')
    contem('lancar-itens', 'o total consolidado do item muda')
    contem('lancar-itens', 'transferência no sentido contrário')
    contem('lancar-itens', 'mas não impede')
  })

  it('a página de saldos manda para a transferência a partir da visão por filial', () => {
    contem('saldos-e-estoque-minimo', 'sobra numa filial e falta em outra')
    contem('saldos-e-estoque-minimo', 'NÃO mexe no Total')
  })

  // ---- F31 · ITN-04 — conferência de estoque (inventário) ----

  it('a conferência tem a seção nomeada pela ordem, com âncora própria', () => {
    expect(ancorasDaPagina(pagina('conferencia-de-estoque')).map((a) => a.id)).toContain(
      'conferencia',
    )
    contem('conferencia-de-estoque', 'Conferência de estoque (inventário)')
  })

  it('diz que a conferência gera AJUSTES, pelo rótulo real de dominio.ts', () => {
    contem('conferencia-de-estoque', `lançamentos de "${TIPO_LANCAMENTO_META.ajuste.rotulo}"`)
  })

  it('trava a distinção que sustenta a tela: linha em branco ≠ contei zero', () => {
    contem('conferencia-de-estoque', 'Linha em branco significa "não conferi"')
    contem('conferencia-de-estoque', 'não é o mesmo que contar zero')
    contem('conferencia-de-estoque', 'digite 0')
  })

  it('diz que o número conferido é o ESTOQUE, não o total', () => {
    contem('conferencia-de-estoque', 'O número que você confere é o ESTOQUE')
    contem('conferencia-de-estoque', 'não está lá para ser contado')
  })

  it('documenta o rascunho e o reenvio idempotente (o par que evita gravar 2×)', () => {
    contem('conferencia-de-estoque', 'Continuar a conferência de {filial} começada às {hora}?')
    contem('conferencia-de-estoque', 'volta a oferecer só o que faltou')
    contem('conferencia-de-estoque', 'NÃO é gravado de novo')
  })

  it('o tamanho do bloco de envio sai da constante real', () => {
    contem('conferencia-de-estoque', `blocos de ${MAX_LINHAS_LOTE_ITEM}`)
  })

  it('promete a verificação que o operador consegue fazer sozinho', () => {
    contem('conferencia-de-estoque', 'Refazer a mesma conferência logo depois deve dar tudo zerado')
  })
})

// ---------------------------------------------------------------------------
// Pendências — CAP-86.
// ---------------------------------------------------------------------------

describe('pendências', () => {
  it('a regra "só Assinado encerra" traz a exceção do import de startup', () => {
    const t = texto('resolver-pendencias')
    expect(t).toContain(normalizarBusca('import de startup'))
    // A exceção precisa estar no verbete do TERMO, não só no de item faltante.
    const glossario = pagina('resolver-pendencias').blocos.find(
      (b): b is Extract<Bloco, { tipo: 'glossario' }> => b.tipo === 'glossario',
    )!
    const termo = glossario.itens.find((v) => v.chave === 'termo')!
    expect(normalizarBusca(termo.descricao)).toContain(normalizarBusca('EXCEÇÃO'))
    expect(normalizarBusca(termo.descricao)).toContain(normalizarBusca('import de startup'))
    expect(normalizarBusca(termo.descricao)).toContain(normalizarBusca('continua permitido'))
  })

  it('cita as abas e as ações reais da fila', () => {
    for (const rotulo of [
      'Todas',
      'Termos',
      'Itens faltantes',
      'Triagem',
      'Patrimônio',
      'Outras',
      'Confirmar assinatura',
      // F28/PND-02 — o botão do lote virou "Resolver itens (N)" quando ganhou o
      // irmão "Confirmar assinatura (N)" para termos: com dois botões na mesma
      // barra, "selecionados" não dizia mais QUAIS. A doc citava o rótulo antigo
      // e ESTE teste a travava — quem pegou foi a revisão adversarial da F28.
      'Resolver itens',
    ]) {
      contem('resolver-pendencias', rotulo)
    }
  })

  it('diz que triagem parada tem prazo, e qual é', () => {
    contem('resolver-pendencias', 'mais de 7 dias')
  })

  // ⚠ Esta asserção JÁ NASCEU protegendo uma inverdade, e por isso mudou duas vezes.
  // O texto original ("os chips do topo são quatro / não existe chip de patrimônio")
  // descrevia o `getPendencias` de antes de 25/07/2026, quando 'patrimonio' virou balde
  // próprio; o teste continuou verde porque cobrava exatamente a frase errada. A F24
  // acrescenta 'conflitos entre filiais' e a frase erraria de novo.
  //
  // Agora ela cobra os rótulos REAIS de `BALDES` (queries/relatorios/pendencias.ts) mais o
  // chip de conflito, que é contado à parte. Se um balde novo aparecer sem prosa, cai aqui.
  it('a prosa dos chips nomeia todos os baldes, com o rótulo real', () => {
    for (const rotulo of [
      'termos de responsabilidade pendentes',
      'itens faltantes de devoluções',
      'ativos aguardando triagem',
      'patrimônios a acertar',
      'conflitos entre filiais',
      'outras pendências',
    ]) {
      contem('resolver-pendencias', rotulo)
    }
    // A frase que afirmava o contrário não pode voltar.
    expect(texto('resolver-pendencias')).not.toContain(
      normalizarBusca('Não existe chip de patrimônio'),
    )
  })
})

// ---------------------------------------------------------------------------
// Administração.
// ---------------------------------------------------------------------------

describe('administração', () => {
  it('cita as sete abas pelo rótulo real', () => {
    for (const aba of [
      'Usuários',
      'Senhas de acesso',
      'Filiais',
      'Motivos',
      'Kits',
      'Itens',
      'Importar',
    ]) {
      contem('administracao', aba)
    }
  })

  it('explica que se desativa em vez de excluir, e as travas de desativação', () => {
    contem('administracao', 'DESATIVAM')
    contem('administracao', 'Já existe uma filial com esse slug.')
    contem('administracao', 'Já existe um motivo com esse código.')
    contem('administracao', 'Já existe um item com esse nome.')
    contem('administracao', 'é fixo depois de criado')
  })

  it('tem um guia por cadastro de apoio', () => {
    const titulos = titulosDePassos('administracao')
    expect(titulos).toContain('Cadastrar ou editar uma filial')
    expect(titulos).toContain('Criar ou editar um motivo')
    expect(titulos).toContain('Cadastrar um item no catálogo')
  })
})

// ---------------------------------------------------------------------------
// Operadores e senhas — CAP-62 · CAP-63 · CAP-103.
// ---------------------------------------------------------------------------

describe('operadores e senhas de acesso', () => {
  it('o convite gera um LINK na tela e nenhum e-mail é enviado', () => {
    contem('usuarios-e-senhas', 'Convidar usuário')
    contem('usuarios-e-senhas', 'Convidar operador')
    contem('usuarios-e-senhas', 'Gerar link')
    contem('usuarios-e-senhas', 'Convite gerado — copie o link')
    contem('usuarios-e-senhas', 'NENHUM e-mail é enviado')
    contem('usuarios-e-senhas', 'não o invalida')
  })

  it('descreve o primeiro acesso: ativar, nome, sobrenome e senha', () => {
    contem('usuarios-e-senhas', 'Ativar meu acesso')
    contem('usuarios-e-senhas', 'Complete seu cadastro de acesso')
    contem('usuarios-e-senhas', 'Sobrenome')
    contem('usuarios-e-senhas', 'DOIS campos separados')
    contem('usuarios-e-senhas', 'Concluir cadastro')
  })

  it('descreve o ciclo da senha de acesso: criar, entregar, ver uso, revogar, reativar', () => {
    contem('usuarios-e-senhas', 'Nova senha')
    contem('usuarios-e-senhas', 'Senha criada — copie agora')
    contem('usuarios-e-senhas', 'ÚNICA vez que a senha aparece')
    contem('usuarios-e-senhas', 'Último uso')
    contem('usuarios-e-senhas', 'Revogar senha de acesso?')
    contem('usuarios-e-senhas', 'Reativar')
    contem('usuarios-e-senhas', 'no próximo carregamento')
  })

  it('não inventa auto-cadastro: só os domínios corporativos entram', () => {
    contem('usuarios-e-senhas', DOMINIOS_TEXTO)
  })

  // F21 — o convite deixou de ser "dar acesso a tudo": ele carrega CARGO e, no
  // caso do operador, as filiais de escrita. As quatro asserções abaixo
  // substituem a antiga "mesmo nível de acesso" (que a spec §3.1 revogou) e
  // cobram mais: o vocabulário derivado, o mínimo de uma filial, o efeito da
  // desativação e a trilha de auditoria.
  it('o convite carrega cargo e filiais, com o rótulo derivado de papeis.ts', () => {
    for (const p of PAPEIS) contem('usuarios-e-senhas', PAPEL_ROTULO[p])
    const g = pagina('usuarios-e-senhas').blocos.find(
      (b): b is Extract<Bloco, { tipo: 'glossario' }> => b.tipo === 'glossario',
    )
    expect(g, 'o glossário de cargos sumiu da tela de usuários').toBeDefined()
    expect(g!.itens.map((v) => v.chave)).toEqual([...PAPEIS])
    for (const v of g!.itens) {
      expect(v.rotulo).toBe(PAPEL_ROTULO[v.chave as PapelUsuario])
      expect(v.descricao).toBe(PAPEL_DESCRICAO[v.chave as PapelUsuario])
    }
    const src = readFileSync(
      join(process.cwd(), 'src', 'lib', 'ajuda', 'conteudo', 'usuarios-e-senhas.ts'),
      'utf8',
    )
    expect(src).toContain('verbetesCargo')
    expect(src, 'rótulo de cargo digitado à mão').not.toContain(`'${PAPEL_ROTULO.admin}'`)
    // A afirmação do modelo antigo não volta por descuido.
    expect(texto('usuarios-e-senhas')).not.toContain(normalizarBusca('mesmo nível de acesso'))
  })

  it('exige ao menos uma filial para o cargo operador (o mesmo que o Zod cobra)', () => {
    contem('usuarios-e-senhas', 'sem nenhuma marcada o convite não é aceito')
    contem('usuarios-e-senhas', 'ao menos uma filial de escrita')
  })

  it('documenta editar cargo, desativar/reativar e as travas de autoproteção', () => {
    const titulos = titulosDePassos('usuarios-e-senhas')
    expect(titulos).toContain('Mudar o cargo ou as filiais de escrita')
    expect(titulos).toContain('Desativar o acesso de alguém que saiu')
    // Rótulos reais da tela de usuários (`components/admin/usuarios/**`): se um
    // deles mudar lá, este assert cai e o guia é reescrito no mesmo commit.
    for (const rotulo of [
      'Editar',
      'Cargo e filiais de escrita',
      'Filiais de escrita',
      'Desativar',
      'Reativar',
      'Auditoria',
    ]) {
      contem('usuarios-e-senhas', rotulo)
    }
    contem('usuarios-e-senhas', 'Você não muda o SEU próprio cargo')
    contem('usuarios-e-senhas', 'último administrador ativo')
    contem('usuarios-e-senhas', 'Seu acesso foi desativado. Fale com um administrador.')
    // Desativar não apaga: a autoria do que a pessoa registrou continua legível.
    contem('usuarios-e-senhas', 'não apague a conta')
    contem('usuarios-e-senhas', 'não apaga nada do histórico')
  })

  it('documenta a trilha de auditoria com o vocabulário real das ações', () => {
    // Os verbos são fechados em `src/lib/auditoria.ts`; a página fala deles em
    // prosa de operador. Rótulo novo lá sem prosa aqui derruba este teste.
    for (const a of ACOES_ADMIN) {
      const rotulo = ACAO_ROTULO[a]
      // "Cargo alterado" → a página diz "cargo alterado"; comparamos normalizado.
      expect(
        texto('usuarios-e-senhas'),
        `a aba de auditoria não menciona "${rotulo}"`,
      ).toContain(normalizarBusca(rotulo))
    }
    contem('usuarios-e-senhas', 'filtro por tipo de ação')
    contem('usuarios-e-senhas', 'só recebe linhas novas')
  })

  it('a pessoa entra na tabela de Usuários no CONVITE, não na ativação', () => {
    // `generateLink({type:'invite'})` já cria a conta em auth.users; o trigger
    // handle_new_user insere o perfil na hora com o e-mail no lugar do nome, e
    // listarUsuarios() não filtra por ativação — a linha e o total nascem ali.
    contem('usuarios-e-senhas', 'assim que o link é gerado')
    contem('usuarios-e-senhas', 'a coluna "Nome" mostra o e-mail dela')
    expect(texto('usuarios-e-senhas')).not.toContain(
      normalizarBusca('só aparece na tabela de Usuários depois de ativar'),
    )
  })

  it('não reproduz o nome de uma filial real no exemplo do rótulo da senha', () => {
    // O placeholder da tela cita uma filial real; a documentação descreve o campo
    // sem copiá-lo (CLAUDE.md: nenhum dado real da WAP na documentação).
    expect(texto('usuarios-e-senhas')).not.toContain(normalizarBusca('Linhares'))
    contem('usuarios-e-senhas', 'o nome da filial ou do parceiro que vai usar a senha')
  })
})

// ---------------------------------------------------------------------------
// Import de startup — CAP-10 · CAP-12 · CAP-15 · CAP-16 · CAP-73.
// ---------------------------------------------------------------------------

describe('import de startup', () => {
  it('descreve o wizard inteiro, passo por passo', () => {
    for (const passo of ['Configurar', 'Upload', 'Preview', 'Confirmar', 'Resultado']) {
      contem('import-de-startup', passo)
    }
    contem('import-de-startup', 'Analisar arquivo')
    contem('import-de-startup', 'Substituir tudo')
    contem('import-de-startup', 'para confirmar')
    contem('import-de-startup', 'Baixar backup')
  })

  it('documenta a correção em massa, a sugestão automática e o Desfazer', () => {
    contem('import-de-startup', 'agrupadas por VALOR')
    contem('import-de-startup', 'sugestão')
    contem('import-de-startup', 'Correções aplicadas')
    contem('import-de-startup', 'Desfazer')
    contem('import-de-startup', 'sem efeito')
    contem('import-de-startup', 'NUNCA é alterado')
  })

  it('documenta "Aplicar tudo", inclusive quando aplica só em parte', () => {
    contem('import-de-startup', 'Aplicar tudo o que está pronto')
    contem('import-de-startup', 'Aplicar todas as correções')
    contem('import-de-startup', 'linhas prontas')
    contem('import-de-startup', 'faltam')
  })

  it('separa aviso âmbar de erro vermelho', () => {
    contem('import-de-startup', 'VERMELHO é bloqueante')
    contem('import-de-startup', 'ÂMBAR é aviso')
    contem('import-de-startup', 'Import bloqueado')
    contem('import-de-startup', 'Pronto para aplicar')
  })

  it('documenta forçar o patrimônio, "Sem patrimônio" e o aviso de service tag', () => {
    contem('import-de-startup', 'Usar mesmo assim')
    contem('import-de-startup', 'Sem patrimônio')
    contem('import-de-startup', 'sem patrimônio físico')
    contem('import-de-startup', 'sem service tag (importam com pendência)')
    contem('import-de-startup', 'preenchidos automaticamente pelo hostname')
  })

  it('documenta que o modelo não repete a marca', () => {
    contem('import-de-startup', 'repete a marca')
    contem('import-de-startup', 'HP Pro SFF 280 G9')
  })

  it('diz o que o import NÃO faz', () => {
    contem('import-de-startup', 'O que o import NÃO faz')
    contem('import-de-startup', 'único modo')
    contem('import-de-startup', 'UMA filial')
    contem('import-de-startup', 'não há sincronização com o Excel')
    contem('import-de-startup', 'snapshots de relatório já congelados permanecem')
  })

  it('a tabela de erros do import está completa (colunas × linhas)', () => {
    const tabelas = pagina('import-de-startup').blocos.filter(
      (b): b is Extract<Bloco, { tipo: 'tabela' }> => b.tipo === 'tabela',
    )
    expect(tabelas.length).toBeGreaterThanOrEqual(2)
    for (const t of tabelas) {
      expect(t.linhas.length).toBeGreaterThan(0)
      for (const linha of t.linhas) expect(linha).toHaveLength(t.colunas.length)
    }
  })
})

// ---------------------------------------------------------------------------
// Voz: manual de operação, não relatório de fase.
// ---------------------------------------------------------------------------

describe('voz e honestidade destas páginas', () => {
  it('nenhuma promete futuro', () => {
    for (const slug of SLUGS_C3) {
      const t = texto(slug)
      for (const proibido of [
        'em breve',
        'por enquanto',
        'esta previsto',
        'sera implementado',
        'proxima fase',
        'ainda nao e possivel',
      ]) {
        expect(t.includes(proibido), `${slug} promete futuro: "${proibido}"`).toBe(false)
      }
    }
  })

  it('nenhuma usa jargão de desenvolvedor no texto do operador', () => {
    // "bucket"/"balde" não são rótulo de tela em lugar nenhum do app: só existem
    // em comentário de código. Na tela o operador lê "tipo" (e "aba", no filtro).
    for (const slug of SLUGS_C3) {
      const t = texto(slug)
      for (const proibido of ['bucket', 'balde', 'endpoint', 'payload', 'deploy']) {
        expect(t.includes(proibido), `${slug} usa jargão: "${proibido}"`).toBe(false)
      }
    }
  })

  it('a tecla L abre o diálogo DENTRO de Itens — não é atalho de navegação', () => {
    // atalho-global.tsx só trata N e ?; o listener do L vive no LancarItemDialog,
    // montado apenas em /itens.
    contem('lancar-itens', 'Dentro da página Itens, a tecla L')
    expect(texto('lancar-itens')).not.toContain(normalizarBusca('atalho: tecla L'))
  })

  it('nenhum patrimônio de exemplo é real', () => {
    for (const slug of SLUGS_C3) {
      for (const m of texto(slug).matchAll(/wap\d{7}/g)) {
        expect(['wap0001234', 'wap0004491'], slug).toContain(m[0])
      }
    }
  })

  it('nenhum guia prometido aponta para página inexistente', () => {
    for (const slug of SLUGS_C3) {
      for (const b of pagina(slug).blocos) {
        if (b.tipo !== 'links') continue
        for (const r of b.itens) {
          expect(paginaPorSlug(r.slug), `${slug} -> ${r.slug}`).toBeDefined()
        }
      }
    }
  })
})

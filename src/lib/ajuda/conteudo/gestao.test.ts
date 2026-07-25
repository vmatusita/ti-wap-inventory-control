import { describe, it, expect } from 'vitest'
import { PAGINAS, ancorasDaPagina, paginaPorSlug } from '@/lib/ajuda/registry'
import { textoDaPagina } from '@/lib/ajuda/indice'
import { normalizarBusca } from '@/lib/ajuda/busca'
import type { Bloco, PaginaAjuda } from '@/lib/ajuda/tipos'
import { ROTULO_TIPO_PENDENCIA, type TipoPendencia } from '@/lib/pendencias/rotulos'
import { TIPO_LANCAMENTO_META, type TipoLancamento } from '@/lib/dominio'
import { MAX_LINHAS_LOTE_ITEM } from '@/lib/validators/item'
import { CAP_EXPORT } from '@/lib/csv'
import { TAMANHOS_PAGINA, TAMANHO_PAGINA_PADRAO } from '@/lib/ativos/lista'
import { DOMINIOS_TEXTO } from '@/lib/auth/dominios-email'
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

  it('o bucket "Patrimônio" deixou de faltar (a fila tem cinco abas, não quatro)', () => {
    contem('resolver-pendencias', ROTULO_TIPO_PENDENCIA.patrimonio)
    contem('resolver-pendencias', 'Cinco tipos')
  })

  it('os seis tipos de lançamento vêm de dominio.ts', () => {
    for (const t of Object.keys(TIPO_LANCAMENTO_META) as TipoLancamento[]) {
      contem('lancar-itens', TIPO_LANCAMENTO_META[t].rotulo)
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
    contem('saldos-e-estoque-minimo', 'CONSOLIDADO')
    contem('saldos-e-estoque-minimo', 'o estoque mínimo não vai no arquivo')
  })

  it('mantém a distinção falta × repor com a fórmula real', () => {
    contem('saldos-e-estoque-minimo', 'Falta e repor são dois avisos DIFERENTES')
    contem('saldos-e-estoque-minimo', 'máx(0, atrelados + liberados − total)')
    contem('saldos-e-estoque-minimo', 'estoque somado de TODAS as filiais')
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
      'Resolver selecionados',
    ]) {
      contem('resolver-pendencias', rotulo)
    }
  })

  it('diz que triagem parada tem prazo, e qual é', () => {
    contem('resolver-pendencias', 'mais de 7 dias')
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
    contem('usuarios-e-senhas', 'mesmo nível de acesso')
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

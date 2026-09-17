// QUEM ESTÁ FORA DA RÉGUA, E POR QUÊ — a lista de exceções e a catraca (F40 · F61).
//
// Estas listas moravam dentro de `src/lib/layout/consistencia.test.ts`. A F61 as
// trouxe para um módulo PURO pelo mesmo motivo que os detectores já moram em
// `regua-de-classes.ts`: a sabotagem que prova a catraca monta um arquivo
// SINTÉTICO EM MEMÓRIA e pergunta "ele escaparia?" — e essa pergunta precisa ser
// respondida pelas MESMAS funções que o teste usa. Duas cópias de régua divergem
// em silêncio; é a lição escrita no cabeçalho de `regua-de-classes.ts`.
//
// ============================================================================
// OS DOIS FUROS QUE A F61 FECHOU (fato 6 da ordem de serviço)
// ============================================================================
// A isenção era por PREFIXO (`p.endsWith('/') ? arquivo.startsWith(p) : …`), e a
// catraca pedida pela ficha — "`SOB_REGRA.length` que só cresce" — tinha dois
// furos:
//   1. APAGAR um arquivo sob a régua derrubaria o número: falso vermelho, e a
//      correção óbvia (baixar o número) ensina a baixar o número.
//   2. Um arquivo NOVO dentro de um prefixo isento nascia fora da régua sem
//      ninguém listá-lo. Foi assim que `admin/filial-apelidos.tsx` nasceu na F56
//      com duas molduras à mão e o CI ficou verde.
//
// A catraca daqui compara CONJUNTOS NOMEADOS, não contagens:
//   · `DIRETORIOS_SEM_ISENCAO` — nenhum arquivo destes diretórios é isento por
//     `PENDENTES`, nem por prefixo, nem por nome. A única porta é
//     `DEVOLVIDOS_F61B`, por arquivo e com a medição do defeito.
//   · `PENDENTES` ⊆ `PENDENTES_CONGELADOS` — a lista só encolhe; entrada nova
//     reprova (e exige tocar as duas constantes, com ata em `docs/DECISOES.md`).
//   · `SOB_REGRA_CONGELADA` — o piso NOMINAL: todo caminho dela que AINDA EXISTE
//     tem de estar sob a régua. O que foi apagado passa; o que voltou a ser isento
//     reprova. Arquivo novo fora dos prefixos pendentes entra sozinho.
//
// Módulo puro, só de servidor por natureza (Vitest e `tsx`); nenhuma tela o importa.

/** Os arquivos do SISTEMA — os únicos que podem definir casco, título e moldura. */
export const SISTEMA: readonly string[] = [
  'src/components/layout/pagina.tsx',
  'src/components/layout/casco-de-autenticacao.tsx',
  'src/components/layout/cartao-de-metrica.tsx',
  'src/components/layout/quadro-de-tabela.tsx',
  'src/components/layout/confirmacao-digitada.tsx',
  'src/components/layout/estado-vazio.tsx',
  'src/components/layout/aviso.tsx',
]

export type Frente = 'a' | 'b' | 'c' | 'd' | 'decisão'

export type Pendente = {
  /** Caminho de arquivo, ou PREFIXO quando termina em `/`. */
  caminho: string
  frente: Frente
  /** Por que ESTA entrada ainda está fora — por entrada, não por frente (F61). */
  motivo: string
}

/**
 * A LISTA DE EXCEÇÕES — o que ainda NÃO foi migrado.
 *
 * **CADA FRENTE SEGUINTE APAGA AS SUAS LINHAS.** A lista só encolhe; acrescentar
 * uma entrada é dizer "desisti de uma tela que já estava sob a régua", e isso
 * precisa de ata em `docs/DECISOES.md` E de tocar `PENDENTES_CONGELADOS` no mesmo
 * commit — a catraca reprova o contrário.
 *
 * A exceção vale para todas as regras de arquivo (1 a 6) e para as rotas das
 * regras 7 e 8. Arquivo do SISTEMA nunca é pendente (ver `ehPendente`).
 *
 * ⚠ F61 — `src/components/admin/` e `src/components/relatorios/` SAÍRAM daqui e
 * não voltam: estão em `DIRETORIOS_SEM_ISENCAO`. As ROTAS desses dois diretórios
 * (`src/app/(app)/admin/`, `src/app/(app)/relatorios/`) continuam: o casco delas
 * (regras 7 e 8) é das frentes b e c do sistema de design, não da F61.
 */
export const PENDENTES: readonly Pendente[] = [
  // ---- frente a · acervo (home, pendências, movimentações) ----------------
  { caminho: 'src/app/(app)/page.tsx', frente: 'a', motivo: 'a home ainda monta o próprio casco' },
  { caminho: 'src/app/(app)/pendencias/', frente: 'a', motivo: 'a rota ainda não usa <Pagina>' },
  {
    caminho: 'src/app/(app)/movimentacoes/',
    frente: 'a',
    motivo: 'as rotas do wizard, da lista e da devolução ainda estão fora do casco',
  },
  {
    caminho: 'src/components/pendencias/',
    frente: 'a',
    motivo: 'migra junto com a rota de pendências (a mesa de conflitos inclusa)',
  },
  {
    caminho: 'src/components/movimentacoes/',
    frente: 'a',
    motivo: 'o wizard de lote migra com a rota, nunca isolado',
  },
  // ---- frente b · relatórios (só as ROTAS) ---------------------------------
  {
    caminho: 'src/app/(app)/relatorios/',
    frente: 'b',
    motivo:
      'as ROTAS: 13 rotas sem casco (regra 7) e 4 esqueletos (regra 8); os componentes já estão sob a régua desde a F61',
  },
  // ---- frente c · admin (só as ROTAS) --------------------------------------
  {
    caminho: 'src/app/(app)/admin/',
    frente: 'c',
    motivo:
      'as ROTAS: os painéis escrevem o próprio <h1> e a barra de abas — decidir a subnavegação é da frente c; os componentes já estão sob a régua desde a F61',
  },
  // ---- frente d · dev, ajuda, versões, telas públicas e a casca do app -----
  { caminho: 'src/app/(app)/dev/', frente: 'd', motivo: 'área do desenvolvedor, com layout próprio' },
  { caminho: 'src/app/(app)/ajuda/', frente: 'd', motivo: 'documentação do operador, rotas dinâmicas' },
  { caminho: 'src/app/(app)/versoes/', frente: 'd', motivo: 'página sem banco, ainda não migrada' },
  {
    caminho: 'src/app/(app)/layout.tsx',
    frente: 'd',
    motivo: 'a casca do app (sidebar, cabeçalho, script anti-flash)',
  },
  { caminho: 'src/app/(app)/loading.tsx', frente: 'd', motivo: 'o esqueleto da casca acompanha o layout.tsx' },
  { caminho: 'src/app/(app)/error.tsx', frente: 'd', motivo: 'o painel de erro da casca' },
  { caminho: 'src/app/(app)/not-found.tsx', frente: 'd', motivo: 'a 404 dentro da casca' },
  { caminho: 'src/app/layout.tsx', frente: 'd', motivo: 'o layout raiz (fontes, metadata, provedores)' },
  { caminho: 'src/app/error.tsx', frente: 'd', motivo: 'o erro global' },
  { caminho: 'src/app/global-error.tsx', frente: 'd', motivo: 'o erro fatal, fora dos provedores' },
  { caminho: 'src/app/not-found.tsx', frente: 'd', motivo: 'a 404 pública' },
  {
    caminho: 'src/app/login/',
    frente: 'd',
    motivo: 'porta pública; migra para o CascoDeAutenticacao junto com as outras portas',
  },
  { caminho: 'src/app/auth/', frente: 'd', motivo: 'portas de convite e de senha; idem' },
  { caminho: 'src/components/dev/', frente: 'd', motivo: 'painéis de diagnóstico e a Zona destrutiva' },
  { caminho: 'src/components/ajuda/', frente: 'd', motivo: 'os blocos da documentação' },
  // ⚠ A CASCA DO APP É POR ARQUIVO, NÃO POR PREFIXO. Um `src/components/layout/`
  // inteiro na lista isentaria também o componente de SISTEMA que alguém criasse
  // amanhã e esquecesse de pôr em `SISTEMA` — ele nasceria fora de todas as
  // regras, em silêncio. Qualquer arquivo novo ali já nasce sob a régua.
  {
    caminho: 'src/components/layout/app-header.tsx',
    frente: 'd',
    motivo: 'o cabeçalho do app, parte da casca',
  },
  {
    caminho: 'src/components/layout/atalhos-dialog.tsx',
    frente: 'd',
    motivo: 'o diálogo de atalhos, superfície de portal da casca',
  },
  {
    caminho: 'src/components/layout/aviso-sem-escrita.tsx',
    frente: 'd',
    motivo: 'a faixa de permissão, anterior ao <Aviso> do sistema',
  },
  {
    caminho: 'src/components/layout/esqueleto-relatorio.tsx',
    frente: 'b',
    motivo: 'o esqueleto de streaming do relatório migra com as ROTAS de relatório',
  },
  {
    caminho: 'src/components/layout/painel-erro.tsx',
    frente: 'd',
    motivo: 'o painel de erro compartilhado da casca',
  },
  {
    caminho: 'src/components/layout/paleta-comandos.tsx',
    frente: 'd',
    motivo: 'a paleta de comandos (cmdk), superfície de portal da casca',
  },
  { caminho: 'src/components/layout/sidebar-nav.tsx', frente: 'd', motivo: 'a navegação lateral da casca' },
  // ---- fora de escopo por DECISÃO, não por frente -------------------------
  {
    caminho: 'src/components/ativos/nova-compra-form.tsx',
    frente: 'decisão',
    motivo:
      '1.412 linhas e 30 useState: formulário é outra frente (ordem F40), e a decomposição está em "Não entra" na ficha F61',
  },
]

/**
 * O retrato de `PENDENTES` no dia em que a F61 fechou. `PENDENTES` tem de ser
 * SUBCONJUNTO dele: apagar linha é livre, acrescentar reprova.
 */
export const PENDENTES_CONGELADOS: readonly string[] = [
  'src/app/(app)/page.tsx',
  'src/app/(app)/pendencias/',
  'src/app/(app)/movimentacoes/',
  'src/components/pendencias/',
  'src/components/movimentacoes/',
  'src/app/(app)/relatorios/',
  'src/app/(app)/admin/',
  'src/app/(app)/dev/',
  'src/app/(app)/ajuda/',
  'src/app/(app)/versoes/',
  'src/app/(app)/layout.tsx',
  'src/app/(app)/loading.tsx',
  'src/app/(app)/error.tsx',
  'src/app/(app)/not-found.tsx',
  'src/app/layout.tsx',
  'src/app/error.tsx',
  'src/app/global-error.tsx',
  'src/app/not-found.tsx',
  'src/app/login/',
  'src/app/auth/',
  'src/components/dev/',
  'src/components/ajuda/',
  'src/components/layout/app-header.tsx',
  'src/components/layout/atalhos-dialog.tsx',
  'src/components/layout/aviso-sem-escrita.tsx',
  'src/components/layout/esqueleto-relatorio.tsx',
  'src/components/layout/painel-erro.tsx',
  'src/components/layout/paleta-comandos.tsx',
  'src/components/layout/sidebar-nav.tsx',
  'src/components/ativos/nova-compra-form.tsx',
]

/** Os diretórios onde NENHUM arquivo é isento por `PENDENTES` (F61). */
export const DIRETORIOS_SEM_ISENCAO: readonly string[] = [
  'src/components/admin/',
  'src/components/relatorios/',
]

export type Devolvido = {
  /** Um ARQUIVO (nunca prefixo) de `DIRETORIOS_SEM_ISENCAO`. */
  arquivo: string
  /** O defeito MEDIDO que a conversão introduziria (rolagem a 390 px, truncamento…). */
  defeito: string
  /** Caminho, a partir da raiz, do arquivo de evidência com a medição. */
  evidencia: string
}

/**
 * A VÁLVULA da F61 — a única porta de isenção nos dois diretórios.
 *
 * Nasce VAZIA. Uma entrada só entra com o defeito MEDIDO e a evidência gravada
 * em `docs/f61-evidencias/` — nunca por volume de trabalho, nunca por prefixo.
 * Só encolhe (⊆ `DEVOLVIDOS_F61B_CONGELADOS`), e cada entrada é backlog F61B.
 */
export const DEVOLVIDOS_F61B: readonly Devolvido[] = []

/** O retrato da válvula no fechamento da F61. */
export const DEVOLVIDOS_F61B_CONGELADOS: readonly string[] = []

export function ehDoSistema(arquivo: string): boolean {
  return SISTEMA.includes(arquivo)
}

function casa(caminho: string, arquivo: string): boolean {
  return caminho.endsWith('/') ? arquivo.startsWith(caminho) : arquivo === caminho
}

/** Este arquivo está fora da régua? */
export function ehPendente(
  arquivo: string,
  pendentes: readonly Pendente[] = PENDENTES,
  devolvidos: readonly Devolvido[] = DEVOLVIDOS_F61B,
): boolean {
  if (ehDoSistema(arquivo)) return false
  if (devolvidos.some((d) => d.arquivo === arquivo)) return true
  return pendentes.some((p) => casa(p.caminho, arquivo))
}

export type EntradaDaCatraca = {
  /** Todos os arquivos varridos pela régua (os `.tsx` de `src/app` e `src/components`). */
  arquivos: readonly string[]
  pendentes?: readonly Pendente[]
  pendentesCongelados?: readonly string[]
  devolvidos?: readonly Devolvido[]
  devolvidosCongelados?: readonly string[]
  sobRegraCongelada?: readonly string[]
  /** Existe arquivo neste caminho (a evidência da válvula)? */
  existe: (caminho: string) => boolean
}

/**
 * A catraca, como função pura: devolve as RECUSAS (vazio = verde).
 *
 * Tudo entra por parâmetro, com os valores reais como padrão — é o que deixa a
 * sabotagem perguntar "e se `relatorios/` voltasse para `PENDENTES`?" sem editar
 * arquivo nenhum.
 */
export function conferirCatraca({
  arquivos,
  pendentes = PENDENTES,
  pendentesCongelados = PENDENTES_CONGELADOS,
  devolvidos = DEVOLVIDOS_F61B,
  devolvidosCongelados = DEVOLVIDOS_F61B_CONGELADOS,
  sobRegraCongelada = SOB_REGRA_CONGELADA,
  existe,
}: EntradaDaCatraca): string[] {
  const recusas: string[] = []
  const existentes = new Set(arquivos)

  // 1 · nenhuma isenção nos dois diretórios — nem prefixo, nem nome, nem entrada
  //     que CONTENHA um deles (`src/components/` inteiro isentaria os dois).
  for (const p of pendentes) {
    for (const dir of DIRETORIOS_SEM_ISENCAO) {
      if (p.caminho.startsWith(dir) || (p.caminho.endsWith('/') && dir.startsWith(p.caminho))) {
        recusas.push(`PENDENTES reabre a isenção de ${dir}: "${p.caminho}"`)
      }
    }
  }

  // 2 · todo arquivo dos dois diretórios está sob a régua — a porta é a válvula.
  for (const arquivo of arquivos) {
    if (!DIRETORIOS_SEM_ISENCAO.some((dir) => arquivo.startsWith(dir))) continue
    if (devolvidos.some((d) => d.arquivo === arquivo)) continue
    if (ehPendente(arquivo, pendentes, devolvidos)) {
      recusas.push(`${arquivo} está fora da régua sem passar por DEVOLVIDOS_F61B`)
    }
  }

  // 3 · a válvula: por arquivo, medida, e só encolhe.
  for (const d of devolvidos) {
    if (!DIRETORIOS_SEM_ISENCAO.some((dir) => d.arquivo.startsWith(dir)) || d.arquivo.endsWith('/')) {
      recusas.push(`DEVOLVIDOS_F61B aceita só ARQUIVO de ${DIRETORIOS_SEM_ISENCAO.join(' ou ')}: "${d.arquivo}"`)
    }
    if (!existentes.has(d.arquivo)) recusas.push(`DEVOLVIDOS_F61B aponta arquivo que não existe: "${d.arquivo}"`)
    if (d.defeito.trim().length < 10) recusas.push(`DEVOLVIDOS_F61B sem o defeito medido: "${d.arquivo}"`)
    if (!d.evidencia.startsWith('docs/f61-evidencias/') || !existe(d.evidencia)) {
      recusas.push(`DEVOLVIDOS_F61B sem evidência gravada em docs/f61-evidencias/: "${d.arquivo}"`)
    }
    if (!devolvidosCongelados.includes(d.arquivo)) {
      recusas.push(`DEVOLVIDOS_F61B ganhou entrada nova (a lista só encolhe): "${d.arquivo}"`)
    }
  }

  // 4 · PENDENTES só encolhe, e cada entrada diz por quê.
  for (const p of pendentes) {
    if (!pendentesCongelados.includes(p.caminho)) {
      recusas.push(`PENDENTES ganhou entrada nova (a lista só encolhe): "${p.caminho}"`)
    }
    if (p.motivo.trim().length < 10) recusas.push(`PENDENTES sem motivo próprio: "${p.caminho}"`)
  }

  // 5 · o piso nominal: quem estava sob a régua e ainda existe, continua.
  for (const arquivo of sobRegraCongelada) {
    if (existentes.has(arquivo) && ehPendente(arquivo, pendentes, devolvidos)) {
      recusas.push(`${arquivo} saiu da régua sem ter sido apagado`)
    }
  }

  return recusas
}

/**
 * O PISO NOMINAL — os caminhos sob a régua medidos no fechamento da F61.
 *
 * Regravar esta lista só para CRESCER (uma frente migrou mais telas). Um caminho
 * apagado do disco pode ficar aqui sem reprovar nada; um caminho que continua no
 * disco e voltou a ser isento reprova na regra 5 de `conferirCatraca`.
 */
export const SOB_REGRA_CONGELADA: readonly string[] = [
  'src/app/(app)/ativos/[id]/loading.tsx',
  'src/app/(app)/ativos/[id]/page.tsx',
  'src/app/(app)/ativos/error.tsx',
  'src/app/(app)/ativos/loading.tsx',
  'src/app/(app)/ativos/novo/loading.tsx',
  'src/app/(app)/ativos/novo/page.tsx',
  'src/app/(app)/ativos/page.tsx',
  'src/app/(app)/itens/conferencia/error.tsx',
  'src/app/(app)/itens/conferencia/loading.tsx',
  'src/app/(app)/itens/conferencia/page.tsx',
  'src/app/(app)/itens/error.tsx',
  'src/app/(app)/itens/historico/error.tsx',
  'src/app/(app)/itens/historico/loading.tsx',
  'src/app/(app)/itens/historico/page.tsx',
  'src/app/(app)/itens/loading.tsx',
  'src/app/(app)/itens/page.tsx',
  'src/components/admin/admin-nav.tsx',
  'src/components/admin/colaborador-dialog.tsx',
  'src/components/admin/colaboradores-tabela.tsx',
  'src/components/admin/com-esta-pessoa-linha.tsx',
  'src/components/admin/convidar-usuario-dialog.tsx',
  'src/components/admin/criar-senha-dialog.tsx',
  'src/components/admin/fila-consolidacao.tsx',
  'src/components/admin/filial-apelidos.tsx',
  'src/components/admin/filial-dialog.tsx',
  'src/components/admin/importar/baixar-backup-button.tsx',
  'src/components/admin/importar/correcoes-aplicadas.tsx',
  'src/components/admin/importar/grupos-erros.tsx',
  'src/components/admin/importar/importar-wizard.tsx',
  'src/components/admin/importar/tabela-erros.tsx',
  'src/components/admin/item-dialog.tsx',
  'src/components/admin/itens-tabela.tsx',
  'src/components/admin/kit-dialog.tsx',
  'src/components/admin/motivo-dialog.tsx',
  'src/components/admin/senha-acoes.tsx',
  'src/components/admin/testar-senha-dialog.tsx',
  'src/components/admin/tipo-do-item-select.tsx',
  'src/components/admin/tipo-item-dialog.tsx',
  'src/components/admin/tipos-item-tabela.tsx',
  'src/components/admin/usuarios/abas-usuarios.tsx',
  'src/components/admin/usuarios/acoes-dev.tsx',
  'src/components/admin/usuarios/alterar-email-dialog.tsx',
  'src/components/admin/usuarios/apagar-usuario-dialog.tsx',
  'src/components/admin/usuarios/auditoria-filtro.tsx',
  'src/components/admin/usuarios/auditoria-tabela.tsx',
  'src/components/admin/usuarios/cargo-e-filiais.tsx',
  'src/components/admin/usuarios/editar-usuario-dialog.tsx',
  'src/components/admin/usuarios/encerrar-sessoes-dialog.tsx',
  'src/components/admin/usuarios/gerar-link-acesso.tsx',
  'src/components/admin/usuarios/status-usuario-acoes.tsx',
  'src/components/admin/usuarios/usuarios-tabela.tsx',
  'src/components/ativos/acoes-excecao-ficha.tsx',
  'src/components/ativos/anotar-dialog.tsx',
  'src/components/ativos/ativos-filtros.tsx',
  'src/components/ativos/ativos-paginacao.tsx',
  'src/components/ativos/ativos-table.tsx',
  'src/components/ativos/ativos-visoes-rapidas.tsx',
  'src/components/ativos/barra-selecao-ativos.tsx',
  'src/components/ativos/confirmar-assinatura-dialog.tsx',
  'src/components/ativos/copiar-patrimonio.tsx',
  'src/components/ativos/corrigir-patrimonio-dialog.tsx',
  'src/components/ativos/definir-service-tag-dialog.tsx',
  'src/components/ativos/editar-ativo-dialog.tsx',
  'src/components/ativos/estornar-dialog.tsx',
  'src/components/ativos/itens-que-foram-junto.tsx',
  'src/components/ativos/lembrar-ativo-recente.tsx',
  'src/components/ativos/lembrar-lista.tsx',
  'src/components/ativos/linha-do-tempo.tsx',
  'src/components/ativos/pendencias-item-ficha.tsx',
  'src/components/ativos/status-badge.tsx',
  'src/components/ativos/termos-da-ficha.tsx',
  'src/components/ativos/voltar-para-ativos.tsx',
  'src/components/itens/badge-repor.tsx',
  'src/components/itens/cabecalho-de-numero.tsx',
  'src/components/itens/carrinho-linhas.tsx',
  'src/components/itens/com-esta-pessoa.tsx',
  'src/components/itens/conferencia/conferencia-estoque.tsx',
  'src/components/itens/escolha-tipo-lancamento.tsx',
  'src/components/itens/historico-filtros.tsx',
  'src/components/itens/historico-lancamentos.tsx',
  'src/components/itens/identidade-do-item.tsx',
  'src/components/itens/item-combobox.tsx',
  'src/components/itens/itens-filtros.tsx',
  'src/components/itens/itens-table.tsx',
  'src/components/itens/lancar-item-campos.tsx',
  'src/components/itens/lancar-item-detalhe-linha.tsx',
  'src/components/itens/lancar-item-dialog.tsx',
  'src/components/itens/resumo-de-itens.tsx',
  'src/components/itens/transferir-item-dialog.tsx',
  'src/components/layout/aviso.tsx',
  'src/components/layout/carregando.tsx',
  'src/components/layout/cartao-de-metrica.tsx',
  'src/components/layout/casco-de-autenticacao.tsx',
  'src/components/layout/confirmacao-digitada.tsx',
  'src/components/layout/credito-autor.tsx',
  'src/components/layout/estado-vazio.tsx',
  'src/components/layout/exportar-csv-button.tsx',
  'src/components/layout/filtro-filial.tsx',
  'src/components/layout/link-ajuda.tsx',
  'src/components/layout/marca.tsx',
  'src/components/layout/nav-rolavel.tsx',
  'src/components/layout/pagina.tsx',
  'src/components/layout/progresso-navegacao.tsx',
  'src/components/layout/quadro-de-tabela.tsx',
  'src/components/layout/rodape-sidebar.tsx',
  'src/components/layout/sidebar-colapso.tsx',
  'src/components/layout/sidebar-lateral.tsx',
  'src/components/layout/tentar-novamente.tsx',
  'src/components/layout/theme-provider.tsx',
  'src/components/layout/user-menu.tsx',
  'src/components/layout/viewer-header.tsx',
  'src/components/layout/viewer-nav.tsx',
  'src/components/relatorios/acesso-form.tsx',
  'src/components/relatorios/aviso-teto-tabela.tsx',
  'src/components/relatorios/barra-acervo.tsx',
  'src/components/relatorios/barras-divergentes.tsx',
  'src/components/relatorios/barras-empilhadas.tsx',
  'src/components/relatorios/barras-horizontais.tsx',
  'src/components/relatorios/botao-imprimir.tsx',
  'src/components/relatorios/card-relatorio.tsx',
  'src/components/relatorios/celulas.tsx',
  'src/components/relatorios/chips-ancora.tsx',
  'src/components/relatorios/corpo-relatorio-v2.tsx',
  'src/components/relatorios/corpo-relatorio.tsx',
  'src/components/relatorios/filial-tabs.tsx',
  'src/components/relatorios/filtros-tabela.tsx',
  'src/components/relatorios/gerados-filtro.tsx',
  'src/components/relatorios/gerar-relatorio-dialog.tsx',
  'src/components/relatorios/grafico-mov-serie.tsx',
  'src/components/relatorios/grupo-colapsavel.tsx',
  'src/components/relatorios/kpi-tiles.tsx',
  'src/components/relatorios/legendas.tsx',
  'src/components/relatorios/lembrar-relatorio-visitado.tsx',
  'src/components/relatorios/linha-expansivel.tsx',
  'src/components/relatorios/lista-manutencao.tsx',
  'src/components/relatorios/lista-modelo-categoria.tsx',
  'src/components/relatorios/lista-modelo.tsx',
  'src/components/relatorios/lista-reservados.tsx',
  'src/components/relatorios/manutencao-casos.tsx',
  'src/components/relatorios/medidor-minimo.tsx',
  'src/components/relatorios/obs-tooltip.tsx',
  'src/components/relatorios/observacao-card.tsx',
  'src/components/relatorios/pendencias-chips.tsx',
  'src/components/relatorios/periodo-filtro.tsx',
  'src/components/relatorios/realtime-refresh.tsx',
  'src/components/relatorios/resumo-periodo.tsx',
  'src/components/relatorios/serie-estado-grafico.tsx',
  'src/components/relatorios/tabela-entradas.tsx',
  'src/components/relatorios/tabela-itens-grupo.tsx',
  'src/components/relatorios/tabela-mov-itens.tsx',
  'src/components/relatorios/tabela-movimentacoes.tsx',
  'src/components/relatorios/tabela-saidas.tsx',
  'src/components/relatorios/tabela-transferencias.tsx',
  'src/components/relatorios/viewer-auto-refresh.tsx',
]

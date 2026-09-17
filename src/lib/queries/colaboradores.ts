import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { CAP_COLABORADORES, paginarTodos } from '@/lib/queries/relatorios/comum'
import {
  MIN_PREFIXO_SUGESTAO,
  prefixoSeguro,
} from '@/lib/busca/prefixo'
import { chaveColaborador, chavesDistintas } from '@/lib/colaboradores/chave'
import { registrarFalha } from '@/lib/observabilidade'
import { linhasDe, linhasOuFalha } from '@/lib/supabase/linhas'
import {
  LEITURA_COLABORADORES_POR_NOME,
  LEITURA_FILA_CONSOLIDACAO,
  LEITURA_RESUMO_CONSOLIDACAO,
  LEITURA_SUGESTAO_CADASTRO,
  LEITURA_SUGESTAO_LANCAMENTOS,
  LEITURA_SUGESTAO_MOVIMENTACOES,
} from '@/lib/queries/formas/colaboradores'

// Leituras do cadastro de pessoas (F37 · D5). Rota só do operador — usam o client do
// servidor com a sessão dele (RLS `authenticated`), como o resto de src/lib/queries.

export type Colaborador = {
  id: string
  nome: string
  matricula: string | null
  setor: string | null
  filial_id: number | null
  ativo: boolean
  // F58: `colaboradores.nome_chave` é coluna GERADA e o catálogo a declara anulável — o tipo à mão
  // dizia `string`, e o cast de `paginarTodos` escondia a diferença. Hoje nenhuma linha é nula
  // (censo de produção, 15/09/2026); o tipo passa a dizer o que a coluna PODE ser.
  nome_chave: string | null
}

export type ColaboradorAdmin = Colaborador & {
  created_at: string
  movimentacoes: number
  lancamentos: number
}

/** Uma linha da fila de consolidação — já agregada pelo banco (view da 0112). */
export type TextoDeColaborador = {
  nome_chave: string
  grafia_exemplo: string
  ocorrencias: number
  grafias: number
  filial_id: number | null
  ja_cadastrado: boolean
  colaborador_id: string | null
}

export type ResumoConsolidacao = {
  /** Grupos de nome distintos ainda sem cadastro. */
  gruposPendentes: number
  /** Registros (movimentações + lançamentos) por trás desses grupos. */
  registrosPendentes: number
  /** Grupos que já têm cadastro correspondente. */
  gruposCadastrados: number
  /** Registros cobertos por um cadastro. */
  registrosCadastrados: number
  /** A fila foi cortada pelo teto? Então os números acima são de um recorte. */
  truncado: boolean
}

// O teto existe porque a fila é uma LISTA, e lista sem teto é a armadilha das 1.000
// linhas (v1.40.2). Mas os NÚMEROS do resumo nunca saem de linhas contadas aqui —
// saem de agregação no banco (`resumoDaConsolidacao`), justamente para o resumo
// continuar verdadeiro quando a lista estiver cortada.
const TETO_FILA = 500

// As duas listas abaixo usam `paginarTodos` (F19/`queries/relatorios/comum.ts`), e não
// um `.limit(N)` grande. O motivo é o defeito da v1.40.2: o PostgREST tem um teto de
// linhas por resposta que é CONFIGURAÇÃO do projeto — hoje 1.000 —, e ele corta a
// resposta **sem erro**. Um `.limit(2000)` não pede 2.000 linhas: pede 2.000 e recebe
// 1.000 caladamente. `paginarTodos` OBSERVA o teto que o servidor de fato entregou na
// primeira página, pagina até o fim, e **lança** ao bater no cap em vez de devolver um
// número truncado com cara de certo. O `.order()` explícito é a outra metade da
// correção: sem ordem total, duas páginas podem repetir ou pular linhas.

// NÃO existe aqui um `listarColaboradoresAtivos`, e a ausência é decisão (revisão de
// 28/08/2026). Ele existiu, exportado, e NUNCA teve um chamador: o campo do fluxo é
// servido por `sugestoesDoCampoColaborador` (prefixo + teto de 8), não por uma lista
// inteira baixada para o cliente. Código morto que ninguém percebe é ruim por si só;
// pior, o comentário do índice `colaboradores_ativo_nome_idx` na migration 0112 o
// citava como "a única consulta quente da tabela" — a errata está no cabeçalho da
// 0115. O índice continua justificado, pelo `where ativo = true order by nome` de
// `sugestoesDoCampoColaborador`.

/** Cadastro completo + quantos registros cada pessoa já tem vinculados. */
export async function listarColaboradoresAdmin(): Promise<ColaboradorAdmin[]> {
  const supabase = await createClient()
  type Row = Colaborador & {
    created_at: string
    movimentacoes: { count: number }[]
    lancamentos_item: { count: number }[]
  }
  // OFFSET, não keyset (F60 · PLAN §2.1, #4): lista de TELA, com ordem composta `nome, id` — o
  // cursor simples pelo `id` mudaria a ordem visível, que é alfabética.
  const linhas = await paginarTodos<Row>(
    'Falha ao listar colaboradores',
    (from, to) =>
      supabase
        .from('colaboradores')
        .select(
          'id, nome, matricula, setor, filial_id, ativo, nome_chave, created_at, movimentacoes(count), lancamentos_item(count)',
        )
        // `nome` NÃO é único (a chave é `nome_chave`), então sozinho ele não é ordem
        // TOTAL — o `id` é o desempate que torna a paginação determinística.
        .order('nome', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    CAP_COLABORADORES,
  )
  return linhas.map((r) => ({
    id: r.id,
    nome: r.nome,
    matricula: r.matricula,
    setor: r.setor,
    filial_id: r.filial_id,
    ativo: r.ativo,
    nome_chave: r.nome_chave,
    created_at: r.created_at,
    movimentacoes: r.movimentacoes?.[0]?.count ?? 0,
    lancamentos: r.lancamentos_item?.[0]?.count ?? 0,
  }))
}

/**
 * A fila de consolidação: os nomes digitados à mão que ainda não têm cadastro,
 * agrupados pela chave normalizada, do mais frequente para o menos.
 *
 * O agrupamento e a contagem vêm PRONTOS da view `v_colaboradores_textos` (0112) —
 * nunca de linhas lidas aqui. É a lição do teto de 1.000
 * (docs/RELATORIO-CORRECAO-TRUNCAMENTO-1000.md): contar no cliente é contar o que
 * coube na página, não o que existe.
 */
export async function filaDeConsolidacao(): Promise<TextoDeColaborador[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('v_colaboradores_textos')
    .select(LEITURA_FILA_CONSOLIDACAO.select)
    .eq('ja_cadastrado', false)
    .order('ocorrencias', { ascending: false })
    .order('grafia_exemplo', { ascending: true })
    // Desempate por `nome_chave` (única na view): sem ele, dois grupos com a mesma
    // contagem e a mesma grafia de exemplo poderiam trocar de lugar entre dois
    // carregamentos, e o corte do teto tiraria um ou outro sem critério.
    .order('nome_chave', { ascending: true })
    // Teto DELIBERADAMENTE abaixo do teto de linhas do PostgREST: uma página só,
    // sem paginação, e a tela AVISA quando há mais (`resumo.truncado`), com os
    // números vindo da view de resumo — que não depende deste corte.
    .limit(TETO_FILA)
  if (error) throw new Error(`Falha ao ler a fila de consolidação: ${error.message}`)
  // `nome_chave`, `grafia_exemplo`, `ocorrencias`, `grafias` e `ja_cadastrado` já saem
  // não-nulos da forma (naoNulaNaView) — o filtro/fallback que existia aqui era defesa
  // contra o `null` mentiroso do gerador, hoje desnecessária. O filtro `.eq('ja_cadastrado',
  // false)` já garante que só chega grupo pendente.
  return linhasDe(data, LEITURA_FILA_CONSOLIDACAO.forma, LEITURA_FILA_CONSOLIDACAO.rotulo).map((r) => ({
    nome_chave: r.nome_chave,
    grafia_exemplo: r.grafia_exemplo,
    ocorrencias: r.ocorrencias,
    grafias: r.grafias,
    filial_id: r.filial_id,
    ja_cadastrado: r.ja_cadastrado,
    colaborador_id: r.colaborador_id,
  }))
}

/**
 * Os números que a tela diz na cara. Somados NO BANCO, pela view
 * `v_colaboradores_consolidacao` (0112) — nem o teto de 1.000 do PostgREST nem o
 * `TETO_FILA` acima influem no que é exibido, porque a resposta tem no máximo DUAS
 * linhas. E o resumo diz se a LISTA foi cortada, para o operador nunca confundir "é
 * isso que existe" com "é isso que coube".
 */
export async function resumoDaConsolidacao(): Promise<ResumoConsolidacao> {
  const supabase = await createClient()

  // UMA leitura de NO MÁXIMO DUAS LINHAS (uma por `ja_cadastrado`) — a view
  // `v_colaboradores_consolidacao` (0112) já soma tudo no banco.
  //
  // ⚠ A primeira versão desta função somava `ocorrencias` paginando os grupos aqui,
  // com o tamanho de página escrito à mão. A revisão adversarial derrubou, e com
  // razão: (a) o teto de linhas do PostgREST é CONFIGURAÇÃO do projeto, e um teto
  // menor que a página pedida faria o laço concluir na primeira volta, devolvendo
  // uma soma menor **em silêncio**; e (b) `.range()` sobre uma view que nasce de
  // `group by`, sem `order by` total, pode enumerar em ordens diferentes entre duas
  // idas ao servidor — repetindo ou pulando linhas. Os dois são exatamente os
  // defeitos que a v1.40.2 documentou (docs/RELATORIO-CORRECAO-TRUNCAMENTO-1000.md).
  //
  // Duas linhas não truncam nunca, em teto nenhum. Era isso que "agregue no SQL"
  // queria dizer.
  const { data, error } = await supabase
    .from('v_colaboradores_consolidacao')
    .select(LEITURA_RESUMO_CONSOLIDACAO.select)
  if (error) throw new Error(`Falha ao resumir a consolidação: ${error.message}`)

  const linhas = linhasDe(data, LEITURA_RESUMO_CONSOLIDACAO.forma, LEITURA_RESUMO_CONSOLIDACAO.rotulo)
  const lado = (cadastrado: boolean) => linhas.find((l) => l.ja_cadastrado === cadastrado)

  const pendentes = lado(false)
  const cadastrados = lado(true)
  const gruposPendentes = pendentes?.grupos ?? 0

  return {
    gruposPendentes,
    registrosPendentes: pendentes?.registros ?? 0,
    gruposCadastrados: cadastrados?.grupos ?? 0,
    registrosCadastrados: cadastrados?.registros ?? 0,
    truncado: gruposPendentes > TETO_FILA,
  }
}

/**
 * Resolve nomes em ids de cadastro, numa consulta só, pela chave normalizada.
 *
 * É o coração do híbrido (F37 §A.3): o registro NOVO grava `colaborador_id` **e** o
 * texto, e o id é descoberto AQUI, no servidor, a partir do que o operador deixou no
 * campo. Quem escolheu da lista resolve; quem digitou "joão  silva" para o cadastro
 * "João Silva" também resolve (a chave é a mesma); quem digitou um nome que não
 * existe não resolve — e a movimentação é gravada do mesmo jeito, com id nulo.
 *
 * Nunca lança: se a consulta falhar, devolve um mapa vazio. O vínculo é um bônus, e
 * derrubar a movimentação do operador por causa dele seria trocar o essencial pelo
 * acessório.
 */
export async function resolverColaboradoresPorNome(
  supabase: Awaited<ReturnType<typeof createClient>>,
  nomes: readonly (string | null | undefined)[],
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  const chaves = chavesDistintas(nomes)
  if (chaves.length === 0) return mapa
  const { data, error } = await supabase
    .from('colaboradores')
    .select(LEITURA_COLABORADORES_POR_NOME.select)
    .in('nome_chave', chaves)
  if (error) {
    registrarFalha({ escopo: 'colaboradores.resolver-por-nome', erro: error })
    return mapa
  }
  const r = linhasOuFalha(data, LEITURA_COLABORADORES_POR_NOME.forma, LEITURA_COLABORADORES_POR_NOME.rotulo)
  if (!r.ok) return mapa
  for (const linha of r.linhas) {
    if (linha.nome_chave) mapa.set(linha.nome_chave, linha.id)
  }
  return mapa
}

// ---------------------------------------------------------------------------
// O campo de colaborador do fluxo (F37 · A.4)
// ---------------------------------------------------------------------------

/** O que o campo precisa saber a cada tecla, numa ida só ao servidor. */
export type SugestoesColaborador = {
  /** Nomes do CADASTRO que casam com o prefixo — a lista que a fase criou. */
  cadastrados: string[]
  /** Grafias do HISTÓRICO que casam e ainda NÃO têm cadastro correspondente. */
  historico: string[]
  /** O que está digitado AGORA já é um cadastro? Decide se oferecemos "Cadastrar". */
  jaCadastrado: boolean
}

const TETO_SUGESTOES = 8

// Teto de linhas VARRIDAS por tabela de histórico. É o mesmo `LINHAS_SUGESTAO` do
// caminho que este campo substituiu (`sugestoesDeColuna`, F10/M4), e não um número
// novo: lá está medido que "o prefixo de 2 letras mais populoso do histórico devolve
// ~90 linhas", e 500 é a folga que sobra disso. A primeira versão deste arquivo
// varria 50 — abaixo do próprio caso medido —, o que fazia a lista perder nomes que
// o campo antigo mostrava, sem nada na tela dizendo que o corte existia.
const LINHAS_HISTORICO = 500

/**
 * Alimenta o campo de colaborador do wizard e do lançamento de item.
 *
 * O CADASTRO vem primeiro e o histórico depois, mas os dois vêm — porque o campo
 * continua sendo texto livre e a maior parte dos nomes ainda só existe no histórico
 * enquanto a consolidação não acontece. Esconder o histórico transformaria o campo
 * numa lista fechada, que é exatamente o que a ordem manda NÃO fazer.
 *
 * O histórico sai das DUAS tabelas que guardam nome digitado à mão — `movimentacoes`
 * e `lancamentos_item` —, exatamente como a view `v_colaboradores_textos` as une.
 * Ler só a primeira deixava o dialogo de lançamento de item sem sugerir as pessoas
 * que só aparecem no diário de itens, que é justamente o campo mais exposto a grafia
 * divergente (era um `<input>` cru até esta fase).
 */
export async function sugestoesDoCampoColaborador(
  prefixo: string,
): Promise<SugestoesColaborador> {
  const vazio: SugestoesColaborador = { cadastrados: [], historico: [], jaCadastrado: false }
  const termo = prefixoSeguro(prefixo)
  if (termo.length < MIN_PREFIXO_SUGESTAO) return vazio

  const supabase = await createClient()

  // A CHAVE do que foi digitado — a MESMA normalização da coluna gerada
  // `colaboradores.nome_chave` (migration 0112 / `src/lib/colaboradores/chave.ts`).
  //
  // Deriva de `termo` (o prefixo já sem curinga), e não de `prefixo` cru:
  // `chaveColaborador` tira acento e caixa, mas NÃO neutraliza `%`, `_`, `*`,
  // `(`, `)`, `,` nem `\` — quem faz isso é só `prefixoSeguro`. Normalizar
  // DEPOIS de limpar o curinga é o que garante que nada perigoso vira padrão de
  // LIKE. (Até a revisão de 31/08/2026 esta linha usava `prefixo`: inofensivo no
  // `.eq()` de baixo, que não interpreta curinga, mas eram duas normas para a
  // mesma coisa — e agora a chave também vai para um LIKE.)
  const chave = chaveColaborador(termo)

  const [doCadastro, deMovimentacoes, deLancamentos, exato] = await Promise.all([
    // O CADASTRO É BUSCADO POR `nome_chave`, NÃO POR `nome` — correção do achado
    // 4 da revisão de 31/08/2026.
    //
    // `ILIKE` do Postgres ignora CAIXA e **não** ignora ACENTO. Com
    // `.ilike('nome', 'Joao Silva%')`, o cadastro "João Silva" não casava — e
    // como `jaCadastrado` (a consulta `exato`, abaixo) sempre usou a chave
    // normalizada, ele casava. As duas juntas fechavam um BECO SEM SAÍDA na
    // tela: a lista vinha vazia E o botão "Cadastrar" sumia, porque
    // `campo-colaborador.tsx` o esconde quando `jaCadastrado` é true. Era
    // exatamente o beco que o comentário da consulta `exato` diz existir para
    // fechar. Agora os dois lados perguntam pela MESMA chave.
    //
    // `.like()` e não `.ilike()`: `nome_chave` é gerada em minúsculas e `chave`
    // também sai minúscula — o fold de caixa do ILIKE seria trabalho à toa.
    //
    // E É SUBSTRING (`%chave%`), não prefixo: com prefixo, digitar o SOBRENOME
    // de alguém não sugeria ninguém, que é a outra metade do mesmo achado. O
    // custo é um scan da tabela de pessoas — pequena, e a única do trio que tem
    // como ser varrida barato. O histórico abaixo continua por prefixo, e a nota
    // lá explica por quê.
    supabase
      .from('colaboradores')
      .select(LEITURA_SUGESTAO_CADASTRO.select)
      .eq('ativo', true)
      .like('nome_chave', `%${chave}%`)
      // A ordem continua por `nome` — a grafia de verdade, com acento e caixa, que
      // é o que o operador lê na lista. O índice `colaboradores_ativo_nome_idx`
      // (ativo, nome) segue fazendo o mesmo papel de antes: resolve o
      // `ativo = true` e entrega as linhas já ordenadas, sem sort extra. Ele nunca
      // sustentou o filtro de texto em si.
      .order('nome')
      .limit(TETO_SUGESTOES),
    // O HISTÓRICO TAMBÉM VIROU SUBSTRING, mas continua SENSÍVEL A ACENTO — e a
    // diferença para o cadastro acima é DECISÃO, não esquecimento (revisão de
    // 31/08/2026).
    //
    // Substring aqui é de graça: os índices destas duas tabelas são sobre
    // `colaborador_id` (a FK), não sobre a coluna de TEXTO `colaborador` — então
    // `ilike 'x%'` já varria tudo, e `ilike '%x%'` varre o mesmo tanto. O que se
    // ganha é o sobrenome passar a sugerir, igual ao cadastro.
    //
    // O ACENTO é que fica de fora, e o motivo é o custo. Não há coluna
    // equivalente a `nome_chave` nestas tabelas; resolver acento significaria ou
    // uma coluna gerada + índice nas tabelas do acervo (migration nova sobre a
    // fonte da verdade), ou filtrar pela view `v_colaboradores_textos`, que
    // reagrupa a UNIÃO INTEIRA das duas a cada tecla. `movimentacoes` cresce todo
    // dia e NUNCA encolhe (`guarda_acervo`, migration 0081), então essa conta só
    // piora. O defeito de VERDADE — o beco sem saída em que a lista vinha vazia e
    // o botão "Cadastrar" sumia — some com a correção de cima, porque
    // `jaCadastrado` só olha `colaboradores`.
    //
    // Se um dia isto importar, mede-se antes de indexar — a régua que a própria
    // migration 0113 registrou para este par de tabelas.
    supabase
      .from('movimentacoes')
      .select(LEITURA_SUGESTAO_MOVIMENTACOES.select)
      .not('colaborador', 'is', null)
      .ilike('colaborador', `%${termo}%`)
      // Ordem explícita: sem ela o corte de `LINHAS_HISTORICO` pega um subconjunto
      // ARBITRÁRIO, e duas cargas da mesma tela podem sugerir listas diferentes.
      .order('colaborador')
      .limit(LINHAS_HISTORICO),
    supabase
      .from('lancamentos_item')
      .select(LEITURA_SUGESTAO_LANCAMENTOS.select)
      .not('colaborador', 'is', null)
      .ilike('colaborador', `%${termo}%`)
      .order('colaborador')
      .limit(LINHAS_HISTORICO),
    // `ativo` entra no SELECT porque "já cadastrado" e "está no ar" são coisas
    // diferentes: o índice único é sobre TODOS os cadastros, mas quem some da lista
    // é só o desativado. Sem esta coluna, um homônimo DESATIVADO marcava
    // `jaCadastrado = true`, o botão "Cadastrar" desaparecia e o operador ficava sem
    // saída nenhuma na tela — o beco que `criarColaboradorInline` existe para fechar.
    supabase
      .from('colaboradores')
      .select('id, ativo')
      .eq('nome_chave', chave)
      .maybeSingle(),
  ])

  if (doCadastro.error) {
    throw new Error(`Falha ao carregar sugestões: ${doCadastro.error.message}`)
  }
  // As outras três NÃO derrubam o campo (ele é texto livre e tem de continuar
  // aceitando o que for digitado), mas o silêncio total mentia: um erro em `exato`
  // devolvia `jaCadastrado = false` e a tela oferecia "Cadastrar" para alguém já
  // cadastrado. Registrado no log do servidor, degradado no que dá para degradar.
  for (const [rotulo, r] of [
    ['movimentacoes', deMovimentacoes],
    ['lancamentos_item', deLancamentos],
    ['cadastro exato', exato],
  ] as const) {
    if (r.error) {
      registrarFalha({
        escopo: 'colaboradores.sugestoes-campo',
        erro: r.error,
        ctx: { tabela: rotulo },
      })
    }
  }

  const cadastrados = linhasDe(
    doCadastro.data,
    LEITURA_SUGESTAO_CADASTRO.forma,
    LEITURA_SUGESTAO_CADASTRO.rotulo,
  ).map((r) => r.nome)
  const chavesCadastradas = new Set(cadastrados.map((n) => chaveColaborador(n)))

  // Dedup pela MESMA chave do banco — assim "João Silva" e "joão  silva" não
  // aparecem como duas opções, e nenhuma grafia já cadastrada se repete na lista.
  const porChave = new Map<string, string>()
  const rMov = linhasOuFalha(deMovimentacoes.data, LEITURA_SUGESTAO_MOVIMENTACOES.forma, LEITURA_SUGESTAO_MOVIMENTACOES.rotulo)
  const rLanc = linhasOuFalha(deLancamentos.data, LEITURA_SUGESTAO_LANCAMENTOS.forma, LEITURA_SUGESTAO_LANCAMENTOS.rotulo)
  const doHistorico = [...(rMov.ok ? rMov.linhas : []), ...(rLanc.ok ? rLanc.linhas : [])]
  for (const linha of doHistorico) {
    const valor = linha.colaborador?.trim()
    if (!valor) continue
    const k = chaveColaborador(valor)
    if (!k || chavesCadastradas.has(k) || porChave.has(k)) continue
    porChave.set(k, valor)
  }

  return {
    cadastrados,
    historico: [...porChave.values()]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .slice(0, TETO_SUGESTOES),
    // Só o cadastro ATIVO conta como "já cadastrado": para o desativado a tela
    // precisa continuar oferecendo o botão, que é o caminho da reativação.
    jaCadastrado: Boolean(exato.data?.id) && exato.data?.ativo === true,
  }
}

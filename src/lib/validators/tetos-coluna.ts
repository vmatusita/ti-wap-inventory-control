// =============================================================================
// tetos-coluna.ts — A FONTE ÚNICA dos tetos de comprimento das colunas de texto (F66B, 12/11/2026)
// =============================================================================
// Desde a F66B, toda coluna `text` das 20 tabelas de negócio (`k_negocio`, supabase/tests/catalogo_policies.sql) tem no
// BANCO um `CHECK (char_length(<col>) <= <teto>)` chamado `<tabela>_<coluna>_tamanho` (migrations 0181–0184). O Zod de
// cada tela continua sendo a primeira linha; o banco passa a ser a última — quem chega por fora da Server Action (a RPC
// chamada direto pela API, um script com service role) é recusado com `23514`.
//
// ESTE MÓDULO É A FONTE dos 65 números. Dele saem: os literais das migrations (conferidos nos dois sentidos pela trava
// de mesa `tetos-coluna.test.ts`), a cópia de `supabase/tests/comprimento_por_coluna.sql` (amarrada pela mesma trava), o
// bloco de contagem de violação (`scripts/comprimento/contagem-violacao.mts`) e a frase pt-BR do `23514`
// (`fraseDeTamanho`, em src/lib/supabase/erros-do-banco.ts). Mudar um teto é: migration NOVA com o `drop`/`add` da
// constraint + este número, no mesmo commit — a trava reprova um sem o outro.
//
// A RÉGUA (docs/PLAN-F66B.md §2, decisão 2): o teto é ≥ o MAIOR teto entre os caminhos com Zod ou `LIMITES_CAMPO_PLANO`
// que gravam na coluna, e ≥ o maior valor vivo nos dois bancos; onde não há Zod, sai da medição com folga escrita (o
// degrau da escada 40 · 80 · 120 · 200 · 320 · 500 · 2000). Os derivados (`*_chave`) têm 3× a origem (a chave pode
// crescer até 3× — fato 21 do PLAN), e a frase cita a ORIGEM. Nenhum teto de tela é baixado por causa deste arquivo.
//
// FOLHA DE PROPÓSITO: sem 'use client', sem import de queries/ nem de supabase/ — é lido pela Server Action, pelo teste,
// pelo script e pela tradução de erro (regra das Convenções do CLAUDE.md).
// =============================================================================

/** O teto de uma coluna. `origem`: a coluna de onde um derivado sai (a frase do `23514` cita a origem). */
export type TetoDeColuna = {
  readonly teto: number
  readonly rotulo: string
  readonly origem?: string
}

export const TETOS_COLUNA = {
  // --- lote 1 · 0181 · os cadastros do acervo ---
  colaboradores: {
    nome: { teto: 120, rotulo: 'Nome do colaborador' },
    matricula: { teto: 40, rotulo: 'Matrícula' },
    setor: { teto: 80, rotulo: 'Setor' },
    nome_chave: { teto: 360, rotulo: 'Nome do colaborador', origem: 'nome' },
  },
  itens: {
    nome: { teto: 80, rotulo: 'Nome do item' },
    nome_chave: { teto: 240, rotulo: 'Nome do item', origem: 'nome' },
  },
  termos_gerados: {
    tipo: { teto: 40, rotulo: 'Tipo do termo' },
    colaborador: { teto: 200, rotulo: 'Colaborador' },
    arquivo_path: { teto: 80, rotulo: 'Arquivo do termo' },
  },
  anotacoes: {
    texto: { teto: 2000, rotulo: 'Anotação' },
  },
  // --- lote 2 · 0182 · o movimento do acervo ---
  ativos: {
    patrimonio: { teto: 60, rotulo: 'Patrimônio' },
    patrimonio_original: { teto: 60, rotulo: 'Patrimônio original' },
    marca: { teto: 60, rotulo: 'Marca' },
    modelo: { teto: 120, rotulo: 'Modelo' },
    service_tag: { teto: 100, rotulo: 'Service tag' },
    hostname: { teto: 60, rotulo: 'Hostname' },
    memoria: { teto: 80, rotulo: 'Memória' },
    armazenamento: { teto: 80, rotulo: 'Armazenamento' },
    processador: { teto: 80, rotulo: 'Processador' },
    fornecedor: { teto: 80, rotulo: 'Fornecedor' },
    colaborador_atual: { teto: 120, rotulo: 'Colaborador' },
    setor_atual: { teto: 120, rotulo: 'Setor' },
    pendencia: { teto: 200, rotulo: 'Pendência' },
    origem: { teto: 40, rotulo: 'Origem' },
    observacoes: { teto: 2000, rotulo: 'Observações' },
    telefone: { teto: 60, rotulo: 'Telefone' },
    imei: { teto: 60, rotulo: 'IMEI' },
    pulsus: { teto: 60, rotulo: 'Pulsus' },
  },
  movimentacoes: {
    motivo: { teto: 40, rotulo: 'Motivo' },
    colaborador: { teto: 120, rotulo: 'Colaborador' },
    setor: { teto: 120, rotulo: 'Setor' },
    chamado: { teto: 80, rotulo: 'Chamado' },
    observacao: { teto: 500, rotulo: 'Observação' },
    chamado_fornecedor: { teto: 200, rotulo: 'Chamado do fornecedor' },
  },
  pendencias_item: {
    item: { teto: 80, rotulo: 'Item' },
    colaborador: { teto: 120, rotulo: 'Colaborador' },
    status: { teto: 40, rotulo: 'Situação' },
    desfecho: { teto: 40, rotulo: 'Desfecho' },
    observacao: { teto: 500, rotulo: 'Observação' },
  },
  lancamentos_item: {
    chamado: { teto: 20, rotulo: 'Chamado' },
    colaborador: { teto: 120, rotulo: 'Colaborador' },
    observacao: { teto: 2000, rotulo: 'Observação' },
  },
  // --- lote 3 · 0183 · o vocabulário ---
  import_prefixos_patrimonio: {
    prefixo: { teto: 4, rotulo: 'Prefixo de patrimônio' },
  },
  import_termos_categoria: {
    termo: { teto: 40, rotulo: 'Termo de categoria' },
    rotulo: { teto: 40, rotulo: 'Rótulo da categoria' },
  },
  import_termos_estado: {
    termo: { teto: 40, rotulo: 'Termo de estado' },
    rotulo: { teto: 40, rotulo: 'Rótulo do estado' },
  },
  unidades_apelidos: {
    apelido: { teto: 80, rotulo: 'Apelido' },
    apelido_chave: { teto: 240, rotulo: 'Apelido', origem: 'apelido' },
  },
  tipos_item: {
    slug: { teto: 30, rotulo: 'Identificador do tipo' },
    rotulo: { teto: 60, rotulo: 'Nome do tipo' },
  },
  motivos: {
    codigo: { teto: 40, rotulo: 'Código do motivo' },
    rotulo: { teto: 80, rotulo: 'Nome do motivo' },
  },
  kits_modelos: {
    nome: { teto: 80, rotulo: 'Nome do kit' },
  },
  filiais: {
    slug: { teto: 40, rotulo: 'Identificador da filial' },
    nome: { teto: 80, rotulo: 'Nome da filial' },
    cidade: { teto: 120, rotulo: 'Cidade' },
  },
  // --- lote 4 · 0184 · os registros ---
  relatorios_gerados: {
    observacao: { teto: 2000, rotulo: 'Observação do relatório' },
  },
  import_logs: {
    modo: { teto: 40, rotulo: 'Modo do import' },
    arquivo_hash: { teto: 128, rotulo: 'Identificador da planilha' },
    backup_path: { teto: 120, rotulo: 'Cópia de segurança do import' },
  },
  eventos_admin: {
    acao: { teto: 80, rotulo: 'Ação registrada' },
    alvo: { teto: 500, rotulo: 'Alvo registrado' },
  },
  senhas_acesso: {
    rotulo: { teto: 80, rotulo: 'Nome da senha' },
    hash: { teto: 200, rotulo: 'Senha' },
  },
} as const satisfies Record<string, Record<string, TetoDeColuna>>

export type TabelaComTeto = keyof typeof TETOS_COLUNA

/**
 * Os quatro lotes, um por migration, na ORDEM DE LOCK das 0175–0178 (decisão 11 do PLAN-F66B). A ordem das tabelas
 * dentro do lote é a ordem dos `alter table` na migration e no rollback (invertida).
 */
export const LOTES_COMPRIMENTO = [
  { migration: '0181_comprimento_cadastros_do_acervo.sql', tabelas: ['colaboradores', 'itens', 'termos_gerados', 'anotacoes'] },
  { migration: '0182_comprimento_movimento_do_acervo.sql', tabelas: ['ativos', 'movimentacoes', 'pendencias_item', 'lancamentos_item'] },
  {
    migration: '0183_comprimento_vocabulario.sql',
    tabelas: [
      'import_prefixos_patrimonio', 'import_termos_categoria', 'import_termos_estado', 'unidades_apelidos', 'tipos_item',
      'motivos', 'kits_modelos', 'filiais',
    ],
  },
  { migration: '0184_comprimento_registros.sql', tabelas: ['relatorios_gerados', 'import_logs', 'eventos_admin', 'senhas_acesso'] },
] as const satisfies readonly { migration: string; tabelas: readonly TabelaComTeto[] }[]

/**
 * O NOME ALTERNATIVO (decisão 3 do PLAN-F66B). Quando `<tabela>_<coluna>_tamanho` já pertence a uma constraint ANTERIOR
 * de outra forma — e renomear é proibido, porque o nome é contrato de tradução —, a constraint da F66B se chama
 * `<tabela>_<coluna>_bruto_tamanho`. Hoje só uma: a 0139 criou `unidades_apelidos_apelido_tamanho` como
 * `char_length(btrim(apelido)) between 2 and 80`, que limita o valor APARADO (espaço nas pontas fica sem teto). A lista
 * nominal irmã, com o motivo, mora em supabase/tests/comprimento_por_coluna.sql (`k_comprimento_nome_alternativo`), e a
 * trava de mesa confere as duas.
 */
export const NOME_ALTERNATIVO_DE_TAMANHO: Readonly<Record<string, string>> = {
  'unidades_apelidos.apelido': 'unidades_apelidos_apelido_bruto_tamanho',
}

/** O nome da constraint de comprimento de uma coluna: `<tabela>_<coluna>_tamanho`, ou o alternativo declarado. */
export function nomeDaConstraintDeTamanho(tabela: string, coluna: string): string {
  return NOME_ALTERNATIVO_DE_TAMANHO[`${tabela}.${coluna}`] ?? `${tabela}_${coluna}_tamanho`
}

export type ConstraintDeTamanho = {
  readonly nome: string
  readonly tabela: string
  readonly coluna: string
  readonly teto: number
  /** O rótulo e o teto que a frase do `23514` cita — os da ORIGEM, num derivado. */
  readonly rotuloNaFrase: string
  readonly tetoNaFrase: number
}

/** As 65 constraints, na ordem dos lotes e das colunas. */
export function constraintsDeTamanho(): ConstraintDeTamanho[] {
  const saida: ConstraintDeTamanho[] = []
  for (const lote of LOTES_COMPRIMENTO) {
    for (const tabela of lote.tabelas) {
      const colunas = TETOS_COLUNA[tabela] as Record<string, TetoDeColuna>
      for (const [coluna, t] of Object.entries(colunas)) {
        const origem = t.origem ? colunas[t.origem] : undefined
        saida.push({
          nome: nomeDaConstraintDeTamanho(tabela, coluna),
          tabela,
          coluna,
          teto: t.teto,
          rotuloNaFrase: origem?.rotulo ?? t.rotulo,
          tetoNaFrase: origem?.teto ?? t.teto,
        })
      }
    }
  }
  return saida
}

/** O teto de uma coluna, ou `undefined` se ela não está na fonte. */
export function tetoDaColuna(tabela: string, coluna: string): number | undefined {
  const colunas = (TETOS_COLUNA as Record<string, Record<string, TetoDeColuna>>)[tabela]
  return colunas?.[coluna]?.teto
}

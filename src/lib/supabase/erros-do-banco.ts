// AS FRASES QUE O APLICATIVO RECONHECE NUMA MENSAGEM DE ERRO DO BANCO — nomeadas e enumeráveis (F58).
//
// Até a F58, `src/lib/actions/erros.ts` traduzia o erro do banco por 132 `m.includes('texto')`
// soltos, e mais 23 casamentos por texto moravam em sete outros arquivos (versao-snapshot.ts,
// admin.ts, itens.ts, colaboradores.ts, dev.ts, kits.ts, tipos-item.ts). Nenhum era conferido contra
// o banco: a migration que reescrevesse um `raise` — e a virada multiempresa reescreve dezenas de
// RPCs — mataria a tradução em silêncio, e a tela passaria a mostrar o genérico "Não foi possível
// concluir a operação".
//
// Aqui cada frase tem NOME, e quatro listas separam quatro origens:
//  · CONSTRAINTS_TRADUZIDAS — nomes de constraint e de índice único. `erros-do-banco-sql.test.ts`
//    confere que cada um EXISTE no esquema que as migrations produzem hoje.
//  · MSG_SQL — os textos NOSSOS de `raise`, um ramo por tradução, com as grafias com e sem acento.
//  · FRASES_DO_MOTOR — o que o Postgres/PostgREST escreve por conta própria ("duplicate key").
//  · FRASES_DO_AUTH — o que o Supabase Auth escreve (convite, troca de e-mail).
//    As duas últimas não vêm de SQL nosso e ficam isentas, por nome, da conferência contra o SQL.
//
// ⚠ AS GRAFIAS COM E SEM ACENTO. Cada ramo segue listando a frase dos dois jeitos, "porque as mensagens
// viajam por caminhos diferentes (RPC → PostgREST → supabase-js)" (F22). A medição da F58 achou que o
// banco de hoje escreve UMA grafia por frase — e nem sempre a acentuada: a máquina de estados (`0134`)
// escreve "invalida para ativo"; as guardas da `0132`, "não é o backup desta filial". Por isso a regra
// do teste é por GRAFIA: cada uma tem de estar no corpo VIVO de uma função, OU ser a gêmea de acento
// de uma grafia viva do MESMO ramo. Frase que só existe num corpo histórico reprova; frase que não
// existe em lugar nenhum e não é gêmea de nada, também.
//
// Módulo PURO e sem dependência: importável pelo Vitest, pelas actions e por função pura de `lib/`.
// `casamento-por-texto.test.ts` reprova casamento de mensagem de erro por texto literal FORA daqui.

/** Uma frase e suas grafias (a viva e a gêmea de acento). */
export type Grafias = readonly [string, ...string[]]

/** A mensagem em minúscula — o que `traduzErroBanco` sempre fez antes de casar. */
export function normalizarMensagem(mensagem: string | null | undefined): string {
  return (mensagem ?? '').toLowerCase()
}

/** A mensagem contém alguma das grafias? Sem caixa, dos dois lados. */
export function casa(mensagem: string | null | undefined, grafias: readonly string[]): boolean {
  const m = normalizarMensagem(mensagem)
  return grafias.some((g) => m.includes(g.toLowerCase()))
}

// ---------------------------------------------------------------------------
// Constraints e índices
// ---------------------------------------------------------------------------

export type ConstraintTraduzida = {
  // `unique-implicita`: o nome nunca é escrito em migration (vem de `unique` numa coluna de `create
  // table`); `unique-nomeada`: escrito por `add constraint`/`rename constraint`; `indice-unico`:
  // escrito por `create unique index`/`alter index … rename`. Conferido em erros-do-banco-sql.test.ts (F65).
  readonly tipo: 'check' | 'indice-unico' | 'unique-implicita' | 'unique-nomeada'
  readonly tabela: string
}

export const CONSTRAINTS_TRADUZIDAS = {
  lanc_item_ajuste_obs: { tipo: 'check', tabela: 'lancamentos_item' },
  lanc_item_chamado: { tipo: 'check', tabela: 'lancamentos_item' },
  lanc_item_qtd_valida: { tipo: 'check', tabela: 'lancamentos_item' },
  // até a F58 `erros.ts` casava o PREFIXO `lanc_item_estorna`; o nome real do índice (0015) é este
  lanc_item_estorna_uidx: { tipo: 'indice-unico', tabela: 'lancamentos_item' },
  // `itens_nome_uidx` (lower(nome), 0014) saiu na 0147 — `itens_nome_chave_uidx`
  // (0125) é estritamente mais forte e cobria toda recusa que o velho fazia
  // (prova na própria migration). Tirar a entrada daqui, e não só do código que a
  // casa, é a doutrina das traduções mortas da F58: nome que não existe mais no
  // esquema vivo reprova em `erros-do-banco-sql.test.ts` se ficasse na lista.
  itens_nome_chave_uidx: { tipo: 'indice-unico', tabela: 'itens' },
  // ⚠ F24: a 0091 apagou e recriou os dois índices de identidade do ativo COM O MESMO NOME,
  // justamente para estes ramos continuarem casando. Renomear mata a tradução — agora com teste.
  ativos_service_tag_sem_patrimonio_uidx: { tipo: 'indice-unico', tabela: 'ativos' },
  // idem: `ativos_patrimonio_service_tag` era prefixo do índice real (0003 → 0091)
  ativos_patrimonio_service_tag_uidx: { tipo: 'indice-unico', tabela: 'ativos' },
  filiais_nome_chave_uidx: { tipo: 'indice-unico', tabela: 'filiais' },
  unidades_apelidos_apelido_chave_uidx: { tipo: 'indice-unico', tabela: 'unidades_apelidos' },
  // nasceu IMPLÍCITO (`slug text not null unique`, 0003); a F65 (0170) o recriou por empresa com o
  // MESMO nome, escrito por extenso (provisório → drop → rename constraint)
  filiais_slug_key: { tipo: 'unique-nomeada', tabela: 'filiais' },
  // o laço da F57, fechado na F65 (0171): recriado por empresa com o MESMO nome — a segunda pista da
  // renumeração da F29 continua casando
  relatorios_gerados_periodo_filial_versao_uidx: { tipo: 'indice-unico', tabela: 'relatorios_gerados' },
  colaboradores_nome_chave_uidx: { tipo: 'indice-unico', tabela: 'colaboradores' },
  colaboradores_nome_nao_vazio: { tipo: 'check', tabela: 'colaboradores' },
  kits_modelos_nome_uidx: { tipo: 'indice-unico', tabela: 'kits_modelos' },
  tipos_item_slug_key: { tipo: 'unique-nomeada', tabela: 'tipos_item' },
  tipos_item_slug_formato: { tipo: 'check', tabela: 'tipos_item' },
  tipos_item_rotulo_nao_vazio: { tipo: 'check', tabela: 'tipos_item' },
} as const satisfies Record<string, ConstraintTraduzida>

export type NomeDeConstraint = keyof typeof CONSTRAINTS_TRADUZIDAS

/** A mensagem cita alguma destas constraints/índices pelo nome? */
export function casaConstraint(mensagem: string | null | undefined, ...nomes: readonly NomeDeConstraint[]): boolean {
  const m = normalizarMensagem(mensagem)
  return nomes.some((n) => m.includes(n))
}

/**
 * Nome de TABELA usado como pista num casamento (a mensagem de violação cita a constraint, que
 * começa pelo nome da tabela). O teste confere que a tabela existe viva.
 */
export const TABELAS_CITADAS_EM_ERRO = {
  snapshotDeRelatorio: 'relatorios_gerados',
} as const

// ---------------------------------------------------------------------------
// Os textos NOSSOS de raise — um ramo por tradução
// ---------------------------------------------------------------------------

export const MSG_SQL = {
  // máquina de estados (0134) — o corpo vivo escreve SEM acento
  transicaoInvalida: ['invalida para ativo', 'inválida para ativo'],
  estornoForaDaUltima: ['ultima movimentacao efetiva', 'última movimentação efetiva'],
  naoPodeSerEstornada: ['nao pode ser estornada', 'não pode ser estornada'],
  // 0146 — a devolução cuja pendência de item já teve desfecho (lançamento gravado)
  estornoComPendenciaResolvida: ['pendencia de item desta devolucao ja teve desfecho'],
  // Reauditoria 18/09/2026 (item U, 0149): as QUATRO escritas atômicas singulares "ativos + anotação".
  foraDoVinculoNadaGravado: ['fora do seu vínculo de escrita', 'fora do seu vinculo de escrita'],
  // A quinta, `confirmar_assinatura_lote_com_anotacoes` (0149), recusa com 42501 e outra frase.
  loteForaDoVinculo: ['fora do seu vínculo de filial', 'fora do seu vinculo de filial'],
  // 0151 — a pré-condição das três singulares, reconferida no WHERE do UPDATE (corrida de dois
  // cliques): outra escrita fez a mesma coisa um instante antes.
  serviceTagAcabouDeSerDefinida: ['service tag deste ativo acabou de ser definida'],
  termoAcabouDeSerConfirmado: ['este termo acabou de ser confirmado como assinado'],
  confirmacaoAcabouDeSerDesfeita: [
    'confirmação deste termo acabou de ser desfeita',
    'confirmacao deste termo acabou de ser desfeita',
  ],
  ajusteExige: ['ajuste exige'],
  estornoExige: ['estorno exige'],
  estornoDeForaDoAtivo: ['estorno_de precisa apontar'],
  // itens por quantidade (0118)
  estoqueInsuficiente: ['estoque insuficiente'],
  ajusteInvalido: ['ajuste inválido', 'ajuste invalido'],
  devolucaoMaiorQueReserva: ['devolução maior', 'devolucao maior', 'atrelado aberto'],
  retornoMaiorQueEmAberto: ['retorno maior', 'liberado em aberto'],
  acertoAutomatico: ['acerto automático', 'acerto automatico'],
  // cargo e vínculo de filial (F21/F22)
  apenasAdministradores: ['apenas administradores'],
  semEscritaNaFilial: ['sem permissao de escrita na filial', 'sem permissão de escrita na filial'],
  soUmDesenvolvedor: ['só um desenvolvedor', 'so um desenvolvedor'],
  apagarUmaConta: ['apagar uma conta'],
  encerrarAsSessoes: ['encerrar as sessões', 'encerrar as sessoes'],
  apagarOPerfil: ['apagar o perfil'],
  restritaAoDesenvolvedor: ['restrita ao cargo desenvolvedor'],
  proprioAcesso: ['seu próprio acesso', 'seu proprio acesso'],
  ultimoAdministrador: ['último administrador ativo', 'ultimo administrador ativo'],
  usuarioEDesenvolvedor: ['este usuário é um desenvolvedor', 'este usuario e um desenvolvedor'],
  // ferramentas destrutivas (F23)
  movimentacoesNoMesmoInstante: ['gravadas no mesmo instante', 'mesmo instante'],
  soAUltimaMovimentacao: ['só a última movimentação', 'so a ultima movimentacao'],
  unicaMovimentacao: ['única movimentação do ativo', 'unica movimentacao do ativo'],
  semRetratoAnterior: ['não tem o retrato do estado anterior', 'nao tem o retrato do estado anterior'],
  termoDaMovimentacao: ['termo gerado a partir desta movimentação', 'termo gerado a partir desta movimentacao'],
  termoDeOutrosAtivos: ['termo que também cobre outros ativos', 'termo que tambem cobre outros ativos'],
  confirmacaoNaoConfere: ['a confirmação não confere', 'a confirmacao nao confere'],
  justificativaObrigatoria: ['justificativa é obrigatória', 'justificativa e obrigatoria'],
  resetSemBackup: ['reset sem backup é proibido', 'reset sem backup e proibido'],
  backupDoResetInexistente: ['backup informado não existe', 'backup informado nao existe'],
  estadoMudouDesdeAPrevia: ['estado mudou desde a prévia', 'estado mudou desde a previa'],
  // import de startup e guardas de escopo (F52)
  backupDoImportInexistente: ['backup deste import não foi encontrado', 'backup deste import nao foi encontrado'],
  backupDeOutraFilial: ['não é o backup desta filial', 'nao e o backup desta filial'],
  confirmacaoDoImport: ['confirmação do import não confere', 'confirmacao do import nao confere'],
  importRepetido: ['já foi importado nesta filial', 'ja foi importado nesta filial'],
  semEscritaNoImport: ['não tem permissão de escrita na filial', 'nao tem permissao de escrita na filial'],
  foraDaOrganizacao: ['não pertence à sua organização', 'nao pertence a sua organizacao'],
  saldoAlvoInvalido: ['saldo alvo precisa ser'],
  // mesa de conflitos entre filiais (F24)
  foraDeConflito: ['só apaga ativo que esteja em conflito', 'so apaga ativo que esteja em conflito'],
  ativosNaoEncontrados: ['ativo(s) não encontrado', 'ativo(s) nao encontrado'],
  backupDosConflitosInexistente: ['backup dos conflitos não existe', 'backup dos conflitos nao existe'],
  termoForaDaSelecao: ['termo que também cobre ativos fora desta seleção', 'termo que tambem cobre ativos fora desta selecao'],
  exigeBackupEmArquivo: ['exige backup em arquivo'],
  backupDeOutraOperacao: ['não é o backup desta operação', 'nao e o backup desta operacao'],
  selecaoGrandeDemais: ['seleção grande demais', 'selecao grande demais'],
  nenhumAtivoSelecionado: ['nenhum ativo selecionado'],
  identidadeNaFilialDeDestino: ['os dois cadastros não podem ficar na mesma filial', 'os dois cadastros nao podem ficar na mesma filial'],
  // vocabulário de unidades (F56 · 0139)
  vocabularioDeUnidades: [
    'já é o próprio nome da filial',
    'ja e o proprio nome da filial',
    'não pode repetir o nome de outra filial',
    'nao pode repetir o nome de outra filial',
    'já é apelido desta própria filial',
    'ja e apelido desta propria filial',
    'já é apelido de outra filial',
    'ja e apelido de outra filial',
  ],
  // o gatilho do kit (F64 · 0164, `kit_motivo_da_empresa`) — 23503 com frase PRÓPRIA, sem "foreign
  // key": o motivo do payload tem de existir na empresa do kit. Não é a FK de verdade.
  kitMotivoForaDaEmpresa: [
    'o motivo deste kit não existe na empresa do kit',
    'o motivo deste kit nao existe na empresa do kit',
  ],
  // a guarda do tenant (F65 · 0173, `guarda_empresa`) — 42501 com frase PRÓPRIA: a `empresa_id` de
  // um registro não muda, em nenhuma das tabelas de negócio. Vem antes do genérico de 42501.
  empresaDoRegistroNaoMuda: ['a empresa de um registro não muda', 'a empresa de um registro nao muda'],
  // a integridade do termo (F65 · 0173, `termo_da_empresa`) — 23503 com frase PRÓPRIA, sem "foreign
  // key": os ids citados pelo termo são da empresa do termo.
  termoForaDaEmpresa: [
    'o termo cita movimentação ou ativo que não é da empresa do termo',
    'o termo cita movimentacao ou ativo que nao e da empresa do termo',
  ],
  // raises P0001 da RPC do import
  estadoDaFilialMudou: ['estado da filial mudou'],
  planoVazio: ['plano de import vazio'],
  termoMisturaFiliais: ['misturam esta filial com outra', 'termo(s) gerado'],
  patrimonioInvalidoNoPlano: ['patrimônio inválido no plano', 'patrimonio invalido no plano'],
  valorInvalidoNoPlano: ['categoria inválida', 'categoria invalida', 'estado-alvo inválido', 'estado-alvo invalido'],
  duplicadoOuRepetida: ['duplicado', 'repetida'],
  serviceTag: ['service tag'],
  divergencia: ['divergência', 'divergencia'],
  // fora do erros.ts: o gatilho de domínio do login (0057) e o P0002 das RPCs de gestão
  dominioRestrito: ['restrito'],
  naoEncontrado: ['não encontrad', 'nao encontrad'],
} as const satisfies Record<string, Grafias>

export type RamoDeMensagem = keyof typeof MSG_SQL

// ---------------------------------------------------------------------------
// O que o MOTOR e o Supabase Auth escrevem — isentos, por nome, da conferência contra o SQL
// ---------------------------------------------------------------------------

/** Frases do Postgres/PostgREST. Nenhuma migration as escreve num `raise`. */
export const FRASES_DO_MOTOR = {
  timeout: ['statement timeout', 'canceling statement due to'],
  unicidade: ['duplicate key', 'unique constraint'],
  chaveDuplicada: ['duplicate key'],
  duplicata: ['duplicate'],
  chaveEstrangeira: ['foreign key', 'violates foreign key'],
  semPermissao: ['row-level security', 'permission denied'],
} as const satisfies Record<string, Grafias>

/** Frases do Supabase Auth (convite, troca de e-mail). Não vêm de SQL nosso. */
export const FRASES_DO_AUTH = {
  contaJaExiste: ['already', 'registered', 'exists', 'been registered'],
  contaJaExisteOuDuplicada: ['already', 'registered', 'exists', 'duplicate'],
} as const satisfies Record<string, Grafias>

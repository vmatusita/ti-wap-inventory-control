import { z } from 'zod'
import { Constants } from '@/lib/types/database'
import { dataNaoFuturaSchema, dataOpcionalSchema } from '@/lib/validators/data'
import type { StatusAtivo, TipoMovimentacao } from '@/lib/dominio'
import { canonicalizarPatrimonio, chavePatrimonio } from '@/lib/patrimonio'

// ---------------------------------------------------------------------------
// TETO DO LOTE DE MOVIMENTACAO (F10/M11) — FONTE UNICA. Era 10 (OS-F2 3.4.1);
// 15 monitores obrigavam duas rodadas. A compra tem teto proprio e maior
// (MAX_LOTE_COMPRA = 200, em patrimonio.ts): ali cada linha e um INSERT de ativo
// novo; aqui cada linha e uma movimentacao com trigger de maquina de estados.
// Toda mensagem que cita o limite (schema, resolver do colar-lista, UI) deriva
// desta constante — nao escreva o numero a mao.
// ---------------------------------------------------------------------------
export const MAX_LOTE_MOVIMENTACAO = 30

// ---------------------------------------------------------------------------
// TRANSICOES — copia EXATA da tabela da spec §4 (0004 no banco), invertida por
// ESTADO: para cada status, os tipos de movimentacao que o banco aceita. Serve
// SO para filtrar o select de tipos na UI (OS-F2 3.3.2); a validacao de verdade
// e o trigger `aplicar_movimentacao`. `estorno` nao entra (e o fluxo da linha do
// tempo, nao do formulario de nova movimentacao). `ajuste` entra em todos os
// estados — e a valvula de escape (exige status_resultante + justificativa).
// ---------------------------------------------------------------------------
export const TRANSICOES: Record<StatusAtivo, TipoMovimentacao[]> = {
  em_estoque: [
    'compra',
    'saida',
    'emprestimo',
    'reserva',
    'envio_manutencao',
    'marcar_defasado',
    'descarte',
    'transferencia',
    'ajuste',
  ],
  reservado: ['saida', 'emprestimo', 'transferencia', 'ajuste'],
  em_uso: ['devolucao', 'envio_manutencao', 'transferencia', 'ajuste'],
  emprestado: ['devolucao', 'transferencia', 'ajuste'],
  em_triagem: [
    'saida',
    'triagem_ok',
    'envio_manutencao',
    'marcar_defasado',
    'descarte',
    'transferencia',
    'ajuste',
  ],
  em_manutencao: [
    'retorno_manutencao',
    'devolucao_fornecedor',
    'marcar_defasado',
    'descarte',
    'transferencia',
    'ajuste',
  ],
  defasado: ['envio_manutencao', 'descarte', 'transferencia', 'ajuste'],
  descartado: ['ajuste'],
  // F14: baixa terminal como descartado — só a válvula de escape sai dela.
  devolvido_fornecedor: ['ajuste'],
}

// Tipos validos para TODOS os itens de um lote (intersecao). Usado no fluxo em
// lote: so oferece um tipo que caiba em todos os ativos selecionados.
export function tiposComunsPara(status: StatusAtivo[]): TipoMovimentacao[] {
  if (status.length === 0) return []
  const conjuntos = status.map((s) => new Set(TRANSICOES[s]))
  const [primeiro, ...resto] = conjuntos
  return [...primeiro].filter((t) => resto.every((s) => s.has(t)))
}

// ---------------------------------------------------------------------------
// CAMPOS_POR_TIPO — a matriz "tipo × campos" do formulario de nova movimentacao
// em UM lugar so. Antes ela estava espalhada como arrays de string repetidos no
// `construirItem` (switch) e no JSX do passo 2 (`['saida','emprestimo']`,
// `['saida','emprestimo','reserva']`, `['saida','emprestimo','devolucao']`…), o
// que virava fonte de bug se um tipo novo entrasse. Fonte unica consultada por:
//   - `construirItem` (serializa a Config nas chaves certas de cada tipo);
//   - a UI condicional do passo 2 (quais inputs aparecem, quais levam "*");
//   - o painel de sucesso (termo so nos tipos que tem termo).
//
// Divisao de responsabilidade com o `movimentacaoSchema` abaixo: a TABELA e a
// fonte da verdade da APLICABILIDADE (que campo existe em cada tipo e se e
// obrigatorio); o SCHEMA, das REGRAS de validacao (formato, min/max, enum). Um
// teste (movimentacao.test.ts) trava os dois em sincronia — o schema segue a
// tabela, sem gerar a uniao em runtime (o que apagaria o narrowing da uniao
// discriminada de que `actions/movimentacoes.ts` depende).
//
// Campos COMUNS a todo tipo (fora da tabela): `ativo_id`, `data`, `chamado`,
// `observacao` — o base do Zod os aceita em qualquer tipo. `chamado` tambem
// aparece na tabela porque sua VISIBILIDADE no passo 2 e por tipo, mas o
// `construirItem` sempre o inclui pelo base. `status_resultante` (ajuste) vem de
// estado proprio do form e e injetado por `montarItensInput`; a tabela so o
// lista para a UI mostrar o select. `estorno_de` idem — o form nao cria estornos
// (fluxo da linha do tempo), a tabela cobre o tipo so por completude.
// ---------------------------------------------------------------------------
export type CampoMovimentacao =
  | 'motivo'
  | 'colaborador'
  | 'setor'
  | 'chamado'
  | 'chamado_fornecedor'
  | 'termo'
  | 'filial_destino'
  | 'status_resultante'
  | 'itens_faltantes'
  | 'estorno_de'

export type RegraCampo = 'obrigatorio' | 'opcional'

export type MetaTipoMovimentacao = {
  // Campos condicionais coletados no formulario para este tipo + a regra de cada.
  campos: Partial<Record<CampoMovimentacao, RegraCampo>>
  // A observacao vira justificativa obrigatoria (>=10 chars) — so no ajuste.
  observacaoObrigatoria?: boolean
  // saida/emprestimo exigem colaborador OU setor (regra cruzada do superRefine).
  exigeColaboradorOuSetor?: boolean
}

const CAMPOS_SAIDA_EMPRESTIMO: MetaTipoMovimentacao = {
  campos: {
    motivo: 'obrigatorio',
    colaborador: 'opcional',
    setor: 'opcional',
    chamado: 'opcional',
    termo: 'opcional',
  },
  exigeColaboradorOuSetor: true,
}

// Tipos "simples": so coletam motivo opcional (compra e os passos de ciclo de
// vida). Espelham o `simples(...)` do schema.
const CAMPOS_SIMPLES: MetaTipoMovimentacao = { campos: { motivo: 'opcional' } }

// F14/MN1 — envio_manutencao deixa de ser "simples": alem do motivo opcional,
// passa a coletar o `chamado` interno (opcional; antes a matriz nem o exibia
// neste tipo) e o `chamado_fornecedor` OBRIGATORIO (o fornecedor abre um chamado
// proprio na manutencao). O banco reforca com a check da 0045.
const CAMPOS_ENVIO_MANUTENCAO: MetaTipoMovimentacao = {
  campos: { motivo: 'opcional', chamado: 'opcional', chamado_fornecedor: 'obrigatorio' },
}

export const CAMPOS_POR_TIPO: Record<TipoMovimentacao, MetaTipoMovimentacao> = {
  compra: CAMPOS_SIMPLES,
  saida: CAMPOS_SAIDA_EMPRESTIMO,
  emprestimo: CAMPOS_SAIDA_EMPRESTIMO,
  reserva: {
    campos: {
      motivo: 'opcional',
      colaborador: 'opcional',
      setor: 'opcional',
      chamado: 'opcional',
    },
  },
  devolucao: { campos: { motivo: 'obrigatorio', itens_faltantes: 'opcional' } },
  triagem_ok: CAMPOS_SIMPLES,
  envio_manutencao: CAMPOS_ENVIO_MANUTENCAO,
  retorno_manutencao: CAMPOS_SIMPLES,
  marcar_defasado: CAMPOS_SIMPLES,
  descarte: CAMPOS_SIMPLES,
  transferencia: { campos: { filial_destino: 'obrigatorio' } },
  ajuste: {
    campos: { status_resultante: 'obrigatorio' },
    observacaoObrigatoria: true,
  },
  estorno: { campos: { estorno_de: 'obrigatorio' } },
  // F14/MN3 — a devolução ao fornecedor tem FLUXO PRÓPRIO (action dedicada, lote
  // sempre 1); NÃO é criada pelo formulário de lote genérico. A entrada existe só
  // para a matriz cobrir os tipos do enum. Os chamados são herdados do último
  // envio_manutencao (read-only no form da devolução), por isso obrigatórios.
  devolucao_fornecedor: {
    campos: { chamado: 'opcional', chamado_fornecedor: 'obrigatorio' },
  },
}

// ----- Predicados derivados da tabela (consumidos pela UI e pelo construirItem) -----

// Este tipo coleta este campo no formulario?
export function campoAplica(
  tipo: TipoMovimentacao | '' | undefined,
  campo: CampoMovimentacao,
): boolean {
  if (!tipo) return false
  return CAMPOS_POR_TIPO[tipo].campos[campo] !== undefined
}

// Este campo e obrigatorio para este tipo? (falso quando nem se aplica.)
export function campoObrigatorio(
  tipo: TipoMovimentacao | '' | undefined,
  campo: CampoMovimentacao,
): boolean {
  if (!tipo) return false
  return CAMPOS_POR_TIPO[tipo].campos[campo] === 'obrigatorio'
}

// A observacao e justificativa obrigatoria neste tipo? (ajuste)
export function observacaoObrigatoria(
  tipo: TipoMovimentacao | '' | undefined,
): boolean {
  if (!tipo) return false
  return CAMPOS_POR_TIPO[tipo].observacaoObrigatoria ?? false
}

// ---------------------------------------------------------------------------
// SCHEMAS
// ---------------------------------------------------------------------------

const termoEnum = z.enum(Constants.public.Enums.termo_status)

// Chamado: opcional, numerico como texto (OS-F2 3.3.1). String vazia = ausente.
const chamadoSchema = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z
    .string()
    .trim()
    .regex(/^\d+$/, 'O chamado deve conter apenas números')
    .optional(),
)

const textoOpcional = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z.string().trim().optional(),
)

// Observacao livre: opcional, ate 500 (spec §8 regra 9).
const observacaoOpcional = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z.string().trim().max(500, 'Observação: no máximo 500 caracteres').optional(),
)

// F14/MN1 — chamado do FORNECEDOR: texto LIVRE, sem máscara nem validação de
// formato (o formato do fornecedor é desconhecido). Obrigatório no envio_manutencao
// e na devolução ao fornecedor. Mensagem pt-BR também no caso ausente (undefined).
const chamadoFornecedorObrig = z
  .string({ message: 'Informe o chamado do fornecedor' })
  .trim()
  .min(1, 'Informe o chamado do fornecedor')
  .max(200, 'Chamado do fornecedor: no máximo 200 caracteres')

// Campos comuns a toda movimentacao.
const base = z.object({
  ativo_id: z.string().uuid('Ativo inválido'),
  data: dataNaoFuturaSchema,
  chamado: chamadoSchema,
  termo_assinado: termoEnum.optional(),
  termo_data: dataOpcionalSchema,
  observacao: observacaoOpcional,
})

// saida / emprestimo: (colaborador OU setor) + motivo. A regra "colaborador OU
// setor" e checada no superRefine da uniao (abaixo).
const saidaSchema = base.extend({
  tipo: z.literal('saida'),
  motivo: z.string().trim().min(1, 'Informe o motivo'),
  colaborador: textoOpcional,
  setor: textoOpcional,
})
const emprestimoSchema = base.extend({
  tipo: z.literal('emprestimo'),
  motivo: z.string().trim().min(1, 'Informe o motivo'),
  colaborador: textoOpcional,
  setor: textoOpcional,
})

// reserva: separa p/ alguem (opcionalmente colaborador/setor/motivo).
const reservaSchema = base.extend({
  tipo: z.literal('reserva'),
  motivo: textoOpcional,
  colaborador: textoOpcional,
  setor: textoOpcional,
})

// devolucao: motivo + checklist de itens faltantes (pode ser vazio).
const devolucaoSchema = base.extend({
  tipo: z.literal('devolucao'),
  motivo: z.string().trim().min(1, 'Informe o motivo'),
  itens_faltantes: z.array(z.string().trim().min(1)).default([]),
})

// transferencia: filial destino obrigatoria. O "≠ filial atual" e checado no
// formulario (esconde a filial atual) e reconferido na Server Action, onde a
// filial corrente do ativo e conhecida.
const transferenciaSchema = base.extend({
  tipo: z.literal('transferencia'),
  filial_destino_id: z.number().int().positive('Escolha a filial de destino'),
})

// ajuste: valvula de escape — status_resultante + justificativa (≥10). Aqui a
// observacao deixa de ser opcional (override do base).
const ajusteSchema = base.extend({
  tipo: z.literal('ajuste'),
  // Mensagens em pt-BR também para o caso ausente (senão o Zod devolve o texto
  // padrão em inglês, que vazaria na lista "Revise antes de continuar").
  status_resultante: z.enum(Constants.public.Enums.status_ativo, {
    message: 'Escolha o novo status do ativo',
  }),
  observacao: z
    .string({ message: 'A justificativa do ajuste é obrigatória' })
    .trim()
    .min(10, 'A justificativa do ajuste precisa de ao menos 10 caracteres')
    .max(500, 'Observação: no máximo 500 caracteres'),
})

// estorno: aponta para a movimentacao original (fluxo da linha do tempo).
const estornoSchema = base.extend({
  tipo: z.literal('estorno'),
  estorno_de: z.string().uuid('Movimentação de origem inválida'),
})

// Tipos "simples": so os campos comuns + motivo opcional.
function simples<T extends TipoMovimentacao>(tipo: T) {
  return base.extend({
    tipo: z.literal(tipo),
    motivo: textoOpcional,
  })
}

// F14/MN1 — envio_manutencao: como "simples" (motivo opcional) + o chamado do
// fornecedor OBRIGATÓRIO. O `chamado` interno (numérico) já vem do base.
const envioManutencaoSchema = base.extend({
  tipo: z.literal('envio_manutencao'),
  motivo: textoOpcional,
  chamado_fornecedor: chamadoFornecedorObrig,
})

export const movimentacaoSchema = z
  .discriminatedUnion('tipo', [
    saidaSchema,
    emprestimoSchema,
    reservaSchema,
    devolucaoSchema,
    transferenciaSchema,
    ajusteSchema,
    estornoSchema,
    simples('compra'),
    simples('triagem_ok'),
    envioManutencaoSchema,
    simples('retorno_manutencao'),
    simples('marcar_defasado'),
    simples('descarte'),
  ])
  .superRefine((val, ctx) => {
    if (val.tipo === 'saida' || val.tipo === 'emprestimo') {
      const temColab = 'colaborador' in val && !!val.colaborador?.trim()
      const temSetor = 'setor' in val && !!val.setor?.trim()
      if (!temColab && !temSetor) {
        ctx.addIssue({
          code: 'custom',
          path: ['colaborador'],
          message: 'Informe o colaborador ou o setor de destino',
        })
      }
    }
  })

export type MovimentacaoInput = z.infer<typeof movimentacaoSchema>

// Lote de 1 a MAX_LOTE_MOVIMENTACAO movimentacoes (OS-F2 3.4.1; teto ampliado na
// F10/M11). O mesmo schema roda no cliente e na Server Action — o teto e unico.
export const loteMovimentacaoSchema = z.object({
  itens: z
    .array(movimentacaoSchema)
    .min(1, 'Adicione ao menos um item ao lote')
    .max(
      MAX_LOTE_MOVIMENTACAO,
      `O lote aceita no máximo ${MAX_LOTE_MOVIMENTACAO} itens`,
    ),
})

export type LoteMovimentacaoInput = z.infer<typeof loteMovimentacaoSchema>

// Estorno disparado pela linha do tempo (id da movimentacao + observacao livre).
export const estornoActionSchema = z.object({
  movimentacao_id: z.string().uuid('Movimentação inválida'),
  observacao: observacaoOpcional,
})

// ---------------------------------------------------------------------------
// M1 — COLAR LISTA NO LOTE DE MOVIMENTACAO (funcoes PURAS)
//
// Por que nao reusar `parsearLista` (patrimonio.ts, da compra): la a linha
// invalida vira `ErroLinha` com mensagem por linha (o form da compra lista os
// erros e BARRA o envio) e "mais de 2 colunas" e erro duro. Aqui a semantica e
// outra — o resolver devolve BALDES (encontrados/ambiguos/naoEncontrados/
// invalidos) e o operador segue com o que deu certo. Alem disso `patrimonio.ts`
// e do W2 nesta OS (mapa §1.3), entao a logica propria mora aqui.
// ---------------------------------------------------------------------------

// Separadores entre patrimonio e service tag — os MESMOS da compra pos-F9
// (virgula, ponto e virgula, TAB: colar duas colunas do Excel gera TAB).
const SEPARADOR_LOTE = /[,;\t]/

// Token que NAO canonicaliza mas ainda assim PARECE patrimonio, e por isso vale
// uma ida ao banco. Patrimonio nao-canonico e legitimo no acervo (spec §5 +
// decisao F7J: a operacao FORCAR criou patrimonios de verdade fora do padrao, e
// a carga do go-live trouxe outros — ~5,6% do acervo do ensaio, 89 de 1.596:
// so-letras, so-digitos, alfanumericos e com hifen). O combobox acha esses
// ativos (busca `ilike` no termo cru); descartar a linha aqui acusaria de
// invalida a linha CERTA do operador — inclusive a que ele acabou de exportar
// da propria tela de Ativos. Charset e comprimento do acervo (o passo 1d da RPC
// do import, migration 0037, so exige sanidade ate 60 caracteres); abaixo de 4
// caracteres ("abc") nao vale nem a consulta.
const TOKEN_CRU_RE = /^[A-Z0-9][A-Z0-9-]{3,59}$/

export type ItemLoteColado = {
  // Canonico (§5) quando a linha canonicaliza; senao o token cru normalizado
  // (trim + maiusculas) — ver TOKEN_CRU_RE.
  patrimonio: string
  // So nas linhas NAO-canonicas: o token exatamente como foi colado (so trim).
  // A busca leva as duas formas porque o `in` do PostgREST e case-sensitive e o
  // acervo tem patrimonio gravado em minusculas.
  patrimonioComoColado?: string
  service_tag?: string
  // Numero da linha ORIGINAL do texto colado (1-based) — a UI aponta o erro.
  linha: number
}

export type LoteColado = {
  // Canal de erro do lote inteiro (ex.: acima do teto). Preenchido = nao ha o
  // que consultar; os demais campos vem vazios.
  erro?: string
  itens: ItemLoteColado[]
  // Linhas cruas que nem PARECEM patrimonio ("abc", "Fulano da Silva", "???").
  // Quem canonicaliza — ou passa no TOKEN_CRU_RE — vira candidato e, se nao
  // existir no acervo, sai como `naoEncontrados` (o resolver e quem decide).
  invalidos: string[]
  // Linhas nao vazias do texto (a base do teto) — inclui as invalidas.
  linhasNaoVazias: number
}

// Quebra o texto colado em itens `{patrimonio, service_tag?}`.
//
// Regras (CONTRATO §1.5 da OS-F10):
//  - uma linha = `PATRIMONIO` ou `PATRIMONIO<sep>SERVICE_TAG`;
//  - colunas extras sao IGNORADAS (colar 3+ colunas do Excel e comum; a 2a
//    continua sendo a service tag e a service tag so DESEMPATA patrimonio
//    duplicado, entao uma coluna a mais nunca escolhe ativo errado);
//  - linha que nao canonicaliza mas parece patrimonio (TOKEN_CRU_RE) entra como
//    candidato CRU (F7J); so o que nem parece vai para `invalidos`;
//  - dedup INTERNO do texto pela chave §5 (patrimonio + service tag), 1a
//    ocorrencia vence — o dedup contra o lote ja montado e o teto ao adicionar
//    sao da UI;
//  - mais de MAX_LOTE_MOVIMENTACAO linhas nao vazias => `erro`, sem consultar
//    o banco.
export function parsearLoteColado(texto: string): LoteColado {
  const brutas = texto.split('\n')
  const naoVazias: { linha: number; texto: string }[] = []

  brutas.forEach((bruto, i) => {
    // Tira espacos e separadores soltos das pontas (`WAP0001234⇥` colado do
    // Excel e 1 coluna, nao 2).
    const t = bruto.replace(/^[\s,;]+/, '').replace(/[\s,;]+$/, '')
    if (t) naoVazias.push({ linha: i + 1, texto: t })
  })

  if (naoVazias.length > MAX_LOTE_MOVIMENTACAO) {
    return {
      erro: `A lista tem ${naoVazias.length} linhas; o lote aceita no máximo ${MAX_LOTE_MOVIMENTACAO}. Registre em lotes separados.`,
      itens: [],
      invalidos: [],
      linhasNaoVazias: naoVazias.length,
    }
  }

  const itens: ItemLoteColado[] = []
  const invalidos: string[] = []
  const vistos = new Set<string>()

  for (const { linha, texto: t } of naoVazias) {
    const corte = t.search(SEPARADOR_LOTE)
    const bruto = (corte === -1 ? t : t.slice(0, corte)).trim()
    const canonico = canonicalizarPatrimonio(bruto)
    const cru = canonico ? '' : bruto.toUpperCase()
    const patrimonio = canonico ?? (TOKEN_CRU_RE.test(cru) ? cru : '')
    if (!patrimonio) {
      invalidos.push(t)
      continue
    }
    // 2a coluna = service tag; da 3a em diante, descartadas.
    const resto = corte === -1 ? '' : t.slice(corte + 1)
    const service_tag =
      resto.split(SEPARADOR_LOTE)[0]?.trim() || undefined

    const chave = chavePatrimonio(patrimonio, service_tag)
    if (vistos.has(chave)) continue
    vistos.add(chave)
    itens.push({
      patrimonio,
      // So quando difere: nao poluir o item canonico (nem a busca) a toa.
      ...(canonico || bruto === patrimonio ? {} : { patrimonioComoColado: bruto }),
      service_tag,
      linha,
    })
  }

  return { itens, invalidos, linhasNaoVazias: naoVazias.length }
}

// Comparacao de service tag para desempatar patrimonio duplicado (§5):
// case-insensitive e sem espacos nas pontas. Nao normaliza hifens/pontos — a ST
// e transcrita da etiqueta, e "adivinhar" formato aqui escolheria ativo errado.
export function mesmaServiceTag(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = a?.trim().toUpperCase() ?? ''
  const nb = b?.trim().toUpperCase() ?? ''
  return na !== '' && na === nb
}

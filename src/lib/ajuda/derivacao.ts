// REGRA DE OURO da documentacao (F6B, estendida na F20): rotulo e vocabulario
// NUNCA se copiam a mao — sao DERIVADOS de `src/lib/dominio.ts` e dos validators.
// Se um rotulo mudar la, a documentacao muda junto no mesmo build; se um valor
// novo entrar num enum, o `Record<Enum, string>` de prosa deixa de compilar ate
// alguem escrever o texto. Aqui moram as funcoes de derivacao; a PROSA mora no
// modulo da pagina que a explica (e entra por parametro), para que cada pagina
// seja dona do que afirma.
//
// SO SERVIDOR: os tetos vem das constantes reais e `@/lib/csv` arrasta PapaParse.
import {
  STATUS_META,
  STATUS_ORDEM,
  TIPO_META,
  TIPO_LANCAMENTO_META,
  TERMO_META,
  CATEGORIA_META,
  CATEGORIA_ORDEM,
  GRUPO_ITEM_META,
  GRUPO_ITEM_ORDEM,
  ACESSORIOS_DEVOLUCAO,
  rotuloAcessorio,
  TERMO_STATUS_ORDEM,
  type CategoriaAtivo,
  type StatusAtivo,
  type TipoMovimentacao,
  type TipoLancamento,
  type TermoStatus,
} from '@/lib/dominio'
import {
  CAMPOS_POR_TIPO,
  type CampoMovimentacao,
  type RegraCampo,
} from '@/lib/validators/movimentacao'
import type { Verbete, VerbeteMovimentacao } from '@/lib/ajuda/tipos'

export function verbetesStatus(descricoes: Record<StatusAtivo, string>): Verbete[] {
  return STATUS_ORDEM.map((s) => ({
    chave: s,
    rotulo: STATUS_META[s].rotulo,
    descricao: descricoes[s],
  }))
}

// Tipada pelo enum, como as irmãs: `Record<string, string>` + `?? padrao` fazia
// uma categoria nova passar despercebida — exatamente a frouxidão que o
// cabeçalho deste módulo diz não existir. Achado da revisão adversarial da F20.
export function verbetesCategoria(descricoes: Record<CategoriaAtivo, string>): Verbete[] {
  return CATEGORIA_ORDEM.map((c) => ({
    chave: c,
    rotulo: CATEGORIA_META[c].rotulo,
    descricao: descricoes[c],
  }))
}

export function verbetesTermo(descricoes: Record<TermoStatus, string>): Verbete[] {
  // Ordem do fluxo do PAPEL (nao -> gerado -> enviado -> sim), que é o inverso
  // da ordem de cobrança de `TERMO_STATUS_ORDEM`. Derivada da constante, e não
  // redigitada: status de termo novo entra aqui sozinho (achado da revisão da
  // F20 — era a única função de derivação com a lista à mão).
  const ordem = [...TERMO_STATUS_ORDEM].reverse()
  return ordem.map((t) => ({
    chave: t,
    rotulo: TERMO_META[t].rotulo,
    descricao: descricoes[t],
  }))
}

export function verbetesTipoLancamento(): Verbete[] {
  // rotulo E descricao ja moram em dominio.ts (TIPO_LANCAMENTO_META, pós-F6A).
  return (Object.keys(TIPO_LANCAMENTO_META) as TipoLancamento[]).map((t) => ({
    chave: t,
    rotulo: TIPO_LANCAMENTO_META[t].rotulo,
    descricao: TIPO_LANCAMENTO_META[t].descricao,
  }))
}

export function verbetesGrupoItem(): Verbete[] {
  return GRUPO_ITEM_ORDEM.map((g) => ({
    chave: g,
    rotulo: GRUPO_ITEM_META[g].rotulo,
    descricao: GRUPO_ITEM_META[g].titulo,
  }))
}

function camposDoTipo(
  t: TipoMovimentacao,
  rotuloCampo: Record<CampoMovimentacao, string>,
): { rotulo: string; obrigatorio: boolean }[] {
  const entradas = Object.entries(CAMPOS_POR_TIPO[t].campos) as [
    CampoMovimentacao,
    RegraCampo,
  ][]
  return entradas.map(([campo, regra]) => ({
    rotulo: rotuloCampo[campo],
    obrigatorio: regra === 'obrigatorio',
  }))
}

export function verbetesMovimentacao(
  efeitos: Record<TipoMovimentacao, string>,
  rotuloCampo: Record<CampoMovimentacao, string>,
): VerbeteMovimentacao[] {
  return (Object.keys(TIPO_META) as TipoMovimentacao[]).map((t) => ({
    chave: t,
    rotulo: TIPO_META[t].rotulo,
    efeito: efeitos[t],
    campos: camposDoTipo(t, rotuloCampo),
  }))
}

/**
 * Checklist de devolucao (acessorios conferidos) — derivado de dominio.ts.
 * Usa `rotuloAcessorio`, que ja e a UNICA implementacao do "codigo -> rotulo"
 * do projeto; a copia inline do `?? codigo` que existia aqui era uma segunda
 * (achado da revisao dos 8 commits da F20). Que nenhum acessorio caia no
 * fallback e travado por `dominio.test.ts`: sem isso, um acessorio novo sem
 * rotulo apareceria na documentacao com o codigo cru.
 */
export function rotulosAcessorios(): string[] {
  return ACESSORIOS_DEVOLUCAO.map((a) => rotuloAcessorio(a))
}

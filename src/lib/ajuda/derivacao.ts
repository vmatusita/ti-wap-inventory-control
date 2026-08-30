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
import { PAPEIS, PAPEL_DESCRICAO, PAPEL_ROTULO } from '@/lib/auth/papeis'
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

// Os CARGOS (F21). Rótulo E descrição vêm de `src/lib/auth/papeis.ts` — mesma
// exceção de `verbetesTipoLancamento`: o vocabulário de cargo já nasce escrito
// em prosa de operador lá (é o texto que a tela de usuários mostra ao lado de
// cada cargo), então redigitá-lo aqui criaria uma segunda versão do mesmo texto
// para dessincronizar. A ordem é a de `PAPEIS`: do cargo mais forte ao mais
// fraco, que é como a hierarquia se lê. Cargo novo no enum do banco aparece na
// documentação sozinho, no mesmo build.
export function verbetesCargo(): Verbete[] {
  return PAPEIS.map((p) => ({
    chave: p,
    rotulo: PAPEL_ROTULO[p],
    descricao: PAPEL_DESCRICAO[p],
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

// F39 — a derivacao dos rotulos do checklist MORREU aqui, junto com a constante
// de dominio.ts que ela lia.
//
// O checklist de devolucao deixou de ser uma lista fixa do codigo e passou a ser o
// catalogo `tipos_item` (F37/F38), que o administrador edita em Administracao ->
// Tipos de item. Enumerar aqui voltaria a ser uma segunda fonte da verdade — e as
// paginas de conteudo sao modulos ESTATICOS, sem banco, entao nao ha como derivar
// a lista de verdade. A frase de `conteudo/devolucao-e-triagem.ts` passou a
// APONTAR o cadastro, que e o que virou verdade.

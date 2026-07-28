// Nome do arquivo BAIXADO do termo (F20B). O objeto no Storage continua sendo
// `${id}.docx` — isto aqui alimenta só o `a.download` do navegador, e é calculado
// NA HORA do download: por isso os termos gerados antes desta ordem passam a baixar
// no padrão novo sem tocar em banco nem em Storage.
//
// Padrão oficial do Johnny (o mesmo dos arquivos que ele nomeava à mão):
//   <prefixo do tipo> - <patrimônio(s)> - <nome do colaborador>.docx
import { familiaDoTipo, type TermoTipo } from '@/lib/termos/tipos'
import { PATRIMONIO_AUSENTE_TERMO } from '@/lib/termos/devolucao'
import type { CamposTermo } from '@/lib/validators/termo'

// Prefixo por tipo. É um mapa PRÓPRIO do nome de arquivo, deliberadamente separado
// de TERMO_ROTULO (que é rótulo de UI): trocar um rótulo na tela não pode renomear
// os downloads em silêncio. Strings exatas do padrão do Johnny — inclusive o
// "monitor" minúsculo, e as duas variantes de monitor caindo no mesmo prefixo.
export const TERMO_NOME_PREFIXO: Record<TermoTipo, string> = {
  devolucao_desligamento: 'Termo de devolução - DESLIGAMENTO',
  devolucao_equipamento: 'Termo de devolução equipamentos',
  responsabilidade_notebook: 'Termo de Responsabilidade Notebook',
  responsabilidade_desktop: 'Termo de Responsabilidade Desktop',
  responsabilidade_celular: 'Termo de Responsabilidade Celular',
  responsabilidade_monitor_interno: 'Termo de Responsabilidade monitor',
  responsabilidade_monitor_homeoffice: 'Termo de Responsabilidade monitor',
}

const SEPARADOR = ' - '
const EXTENSAO = '.docx'

// Último recurso: tipo desconhecido (linha antiga do banco) com todos os campos
// vazios não pode produzir um arquivo chamado só ".docx".
const NOME_MINIMO = 'termo.docx'

// Teto do nome completo, extensão inclusa. Não é limite de sistema de arquivos — é
// folga: nome quilométrico atrapalha anexo de e-mail e pasta de rede.
export const NOME_ARQUIVO_MAX = 150

const ESPACOS = /\s+/g

// Espaço e traço sobrando nas PONTAS de um segmento. O `nomeDownload` antigo
// aparava isso de graça (ele trocava tudo que não fosse alfanumérico por hífen e
// depois apava as pontas); sem isso, um "- Fulano -" colado de planilha vira
// `Prefixo - - Fulano -.docx`, com separador duplicado e traço solto.
const PONTAS = /^[\s-]+|[\s-]+$/g

// Os que o Windows não aceita em nome de arquivo. Escritos como STRING comum (e os
// de controle testados por código, logo abaixo) de propósito: faixa de controle ou
// de combinantes escrita direto numa regex literal já virou mojibake silencioso
// neste projeto quando o arquivo passou por ferramenta que não preservou UTF-8 — e
// o estrago só apareceria em nome acentuado, longe daqui.
const PROIBIDOS_WINDOWS = '\\/:*?"<>|'

function ehDescartavel(caractere: string): boolean {
  const codigo = caractere.codePointAt(0) ?? 0
  return (
    codigo < 32 || // controles C0
    (codigo >= 0x7f && codigo <= 0x9f) || // DEL + controles C1
    // Largura zero e marcas de direção. Não são "invisíveis inofensivos" num nome
    // de arquivo: U+202E (sobrescrita da direita para a esquerda) faz o
    // gerenciador de downloads mostrar o nome invertido — o truque clássico de
    // disfarçar extensão —, e o U+200B produz nomes idênticos aos olhos e
    // distintos para a busca da pasta de rede. O campo é texto livre colado de
    // e-mail e planilha, então isso chega aqui de graça.
    (codigo >= 0x200b && codigo <= 0x200f) ||
    (codigo >= 0x202a && codigo <= 0x202e) ||
    (codigo >= 0x2066 && codigo <= 0x2069) ||
    codigo === 0xfeff ||
    PROIBIDOS_WINDOWS.includes(caractere)
  )
}

// Limpa um segmento. O espaço em branco de qualquer tipo (tabulação, quebra de
// linha) vira espaço ANTES do descarte, para "Fulano<TAB>de Tal" não virar
// "Fulanode Tal". Acentos e espaços do nome do colaborador ficam INTACTOS.
function sanitizar(texto: string): string {
  return [...texto.replace(ESPACOS, ' ')]
    .filter((c) => !ehDescartavel(c))
    .join('')
    .replace(ESPACOS, ' ')
    .replace(PONTAS, '')
}

// Chave de comparação tolerante (sem acento, sem caixa, sem espaço sobrando). O
// campo é texto livre (spec §3.9): o operador pode ter digitado "Sem Patrimonio".
// Os diacríticos combinantes (U+0300–U+036F) saem por faixa de code point, sem
// escape na regex — mesmo motivo do bloco acima.
function chaveComparacao(texto: string): string {
  return [...texto.normalize('NFD')]
    .filter((c) => {
      const codigo = c.codePointAt(0) ?? 0
      return codigo < 0x0300 || codigo > 0x036f
    })
    .join('')
    .toLowerCase()
    .replace(ESPACOS, ' ')
    .trim()
}

const CHAVE_AUSENTE = chaveComparacao(PATRIMONIO_AUSENTE_TERMO)

// Patrimônios que entram no nome, NA ORDEM em que estão no documento.
//
// A vírgula só é separador na DEVOLUÇÃO: `patrimonios` é a string "A, B, C" que
// `concatenarEquipamentos` montou na ordem do termo (notebook → monitor → celular
// → demais). Na RESPONSABILIDADE o campo é `patrimonio` — UM ativo —, e como ele
// é editável (spec §3.9), uma vírgula ali é parte do que o operador escreveu
// ("WAP0001234, com carregador"), não separador: dividir inventaria um segundo
// patrimônio que não existe.
//
// O texto entra como está: NÃO passa por `canonicalizarPatrimonio`, de propósito.
// O nome do arquivo tem de espelhar o patrimônio IMPRESSO no documento, e o .docx
// também usa o campo cru — canonicalizar só aqui faria o nome divergir do papel.
// (É a exceção consciente à convenção "patrimônio sempre no formato canônico" do
// CLAUDE.md, que vale para as telas de consulta.)
//
// Descartado o que não identifica nada: partes vazias e o "sem patrimônio" dos
// ativos sem plaqueta (F7E).
function listaPatrimonios(tipo: TermoTipo, campos: CamposTermo): string[] {
  const brutos =
    familiaDoTipo(tipo) === 'devolucao'
      ? (campos.patrimonios ?? '').split(',')
      : [campos.patrimonio ?? '']
  return brutos
    .map(sanitizar)
    .filter((p) => p !== '' && chaveComparacao(p) !== CHAVE_AUSENTE)
}

// Corta `texto` para caber em `limite` unidades de código, SEM partir caractere.
// `slice()` cru contaria certo e ainda assim quebraria um par surrogate ao meio
// (emoji, por exemplo), deixando meio caractere inválido no nome do arquivo — o
// iterador de string anda por code point, então isso não acontece aqui.
function cortarSemPartirCaractere(texto: string, limite: number): string {
  if (texto.length <= limite) return texto
  let saida = ''
  for (const caractere of texto) {
    if (saida.length + caractere.length > limite) break
    saida += caractere
  }
  return saida
}

// Junta os três segmentos, omitindo os vazios (some junto o " - " correspondente).
function montar(prefixo: string, patrimonios: string[], colaborador: string): string {
  const nome = [prefixo, patrimonios.join(SEPARADOR), colaborador]
    .filter((s) => s !== '')
    .join(SEPARADOR)
  return nome === '' ? NOME_MINIMO : nome + EXTENSAO
}

export function nomeArquivoTermo(tipo: TermoTipo, campos: CamposTermo): string {
  // `?? ''` cobre linha antiga do banco com tipo fora do mapa — degrada omitindo o
  // segmento, nunca lança. Todo campo de CamposTermo é opcional (o schema é
  // `.partial()`), então `{}` também é entrada válida.
  const prefixo = sanitizar(TERMO_NOME_PREFIXO[tipo] ?? '')
  const colaborador = sanitizar(campos.colaborador ?? '')

  // Teto: descarta patrimônios DO FIM para o começo, sempre em separador inteiro
  // (nunca no meio de um código), até caber. Os primeiros são os que mais
  // identificam o documento — na devolução, são a ordem do próprio termo.
  const lista = listaPatrimonios(tipo, campos)
  let nome = montar(prefixo, lista, colaborador)
  while (nome.length > NOME_ARQUIVO_MAX && lista.length > 0) {
    lista.pop()
    nome = montar(prefixo, lista, colaborador)
  }
  if (nome.length <= NOME_ARQUIVO_MAX) return nome

  // Sobrou só prefixo + colaborador e ainda estourou (o Zod aceita 200 caracteres
  // de colaborador): o único segmento que pode ceder é o nome. O orçamento é
  // contado aqui, e NÃO derivado de `montar()` — aquela função tem um caso
  // especial (NOME_MINIMO) que faria a conta herdar um literal sem relação.
  const ocupado =
    (prefixo === '' ? 0 : prefixo.length + SEPARADOR.length) + EXTENSAO.length
  const folga = Math.max(0, NOME_ARQUIVO_MAX - ocupado)
  const cortado = sanitizar(cortarSemPartirCaractere(colaborador, folga))
  return montar(prefixo, [], cortado)
}

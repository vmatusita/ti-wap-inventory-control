'use client'

import Link from 'next/link'
import { ArrowRightLeft, ChevronDown, MoreHorizontal, Plus, ScrollText } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Dica } from '@/components/ui/dica'
import { QuadroDeTabela } from '@/components/layout/quadro-de-tabela'
import { BotaoExpandir, useExpandidas } from '@/components/relatorios/linha-expansivel'
import {
  CabecalhoDeNumero,
  type CabecalhoDeNumero as MetaDeNumero,
} from '@/components/itens/cabecalho-de-numero'
import { IdentidadeDoItem } from '@/components/itens/identidade-do-item'
import { dispararLancarItem } from '@/components/itens/lancar-item-evento'
import { dispararTransferirItem } from '@/components/itens/transferir-item-evento'
import {
  distribuicaoDoItem,
  rotulosCurtosDeFilial,
  type CelulaDeFilial,
} from '@/lib/itens/distribuicao'
import { emUsoDoSaldo, type LinhaDeItem, type NumerosDoItem } from '@/lib/itens/lista'
import { minimoDoItem, type MinimosPorItem } from '@/lib/itens/repor'
import { cn } from '@/lib/utils'
import type { Filial } from '@/lib/queries/filiais'

// A TABELA DE ITENS — a filial saiu de trás do chevron e virou linha (F43).
//
// ============================================================================
// O QUE MUDOU, E POR QUÊ — a fase anterior consertou a ESTRUTURA, esta a LEITURA
// ============================================================================
// A F42 (31/08/2026) matou o `?visao=`, pôs a tela no casco da F40 e deu rota
// própria ao histórico. Resolveu a dor D3 do `docs/PLANO-ITENS.md` — "a view de
// itens foge totalmente do padrão do sistema". Não resolveu a leitura. O Johnny,
// olhando a tela entregue, em 01/09/2026:
//
//   "ainda está mto confusa e a visualização não está boa, não consigo entender
//    de cara o que é cada coisa, tem que ser algo que entenda logo ao bater o olho"
//
// E, perguntado sobre o que a tela tem de responder em 5 segundos, escolheu UMA
// coisa: **onde está o item — quanto tem em cada filial.**
//
// A medição da tela de 01/09/2026 (`docs/f43-evidencias/antes/`) mostrou por que
// ela não respondia:
//
//  · em **1440px**, a pergunta "em quais filiais este item está?" deu **NÃO SEI
//    nas quatro passadas** de julgamento independente — a distribuição existia só
//    atrás do chevron, um item por vez;
//  · em **390px**, "quanto está na prateleira e quanto com as pessoas?" deu **NÃO
//    SEI nas quatro** — porque a tabela pedia **740px numa caixa de 356px** e as
//    colunas de número ficavam FORA da área visível. No celular a tela mostrava o
//    nome do item e mais nada.
//
// ============================================================================
// AS QUATRO MUDANÇAS, e o que cada uma conserta
// ============================================================================
// 1. **A FILIAL VIRA COLUNA, PERMANENTE.** Uma coluna por filial, com o saldo em
//    estoque de cada uma, a partir de `xl`. Isso REVISA PARCIALMENTE a escolha da
//    F42 de mandar a comparação para a linha expansível — e revisa só o
//    esconderijo: a linha expansível CONTINUA, com os quatro números por filial e
//    o atalho de transferir. O que não volta, em hipótese nenhuma, é o `?visao=`:
//    aquilo era um FILTRO que trocava as colunas em vez de recortar as linhas, e
//    morreu por decisão registrada. Isto aqui é apresentação permanente — não há
//    modo, alternador nem preferência.
// 2. **A CLASSIFICAÇÃO SAI DE DUAS COLUNAS E VIRA UMA LINHA.** Grupo e Tipo eram
//    `hidden md:table-cell` e `hidden lg:table-cell` — no celular não existiam. E
//    "Acessórios e periféricos" repetido 24 vezes gastava 140px com a informação
//    de menor variação da tela. Agora vivem sob o nome, em TODA largura
//    (`IdentidadeDoItem`). Ganho de leitura E a largura que a filial precisava.
// 3. **O CABEÇALHO DIZ O QUE O NÚMERO SIGNIFICA.** Era só `Dica` — que pede um
//    gesto, espera um tempo e no celular quase não existe. Agora a explicação
//    curta é visível, e a dica continua para o detalhe (`CabecalhoDeNumero`).
// 4. **A CÉLULA DO NOME QUEBRA LINHA.** `TableCell` do kit é `whitespace-nowrap`;
//    era o nome comprido que empurrava a tabela para 740px e jogava os números
//    para fora da tela no celular. `whitespace-normal` nesta célula — e só nela —
//    é o que faz a tabela caber em 356px.
//
// O VOCABULÁRIO NÃO MUDOU. *Total · Em estoque · Em uso · Falta · Reservado*
// continuam com esses nomes, e continuam saindo de `NUMEROS_ITEM` (decisão do
// Johnny, 01/09/2026: ele escolheu redesenho visual e RECUSOU revisão de rótulos).
// A ORDEM das quatro colunas também não mudou — o comentário de `NUMEROS_ITEM`
// diz que a ordem de lá é a ordem das colunas de cá, e ela continua sendo. O que
// mudou é o PESO: *Em estoque* é a âncora e os outros três a acompanham.
//
// ⚠ CLIENT, e não Server Component. O motivo continua sendo um só: o chevron
// guarda estado. Tudo que não precisa de estado chega pronto por prop — os
// números, os rótulos, o mapa de mínimos, a lista de filiais.

// ⚠ A APRESENTAÇÃO É CONSTANTE DO CÓDIGO, e não escolha de ninguém. Três
// candidatas foram fotografadas com ESTE componente e submetidas ao teste dos 5
// segundos (ata em `docs/DECISOES.md`): a matriz venceu, a matriz com o par
// "em estoque + em uso" por célula criou dúvida nova ("por que esta filial não
// tem a segunda linha?"), e a faixa de blocos dentro da célula do nome ficou
// ilegível no celular — 7.751px de altura de página contra 3.449px da matriz, e
// "quanto está na prateleira" virou NÃO SEI nas duas passadas. Não há alternador,
// não há param de URL, não há preferência: se um dia outra apresentação for
// melhor, ela se mede e se troca aqui.

// Revelação progressiva, na régua de `ativos-table.tsx`. Em ~390px cabem
// Item + Em estoque + Em uso; as demais aparecem conforme a tela cresce, e nada
// SOME de vez: o que se esconde na largura pequena está na linha expansível.
const COL: Record<string, string> = {
  // ⚠ O CHEVRON SÓ EXISTE ONDE A MATRIZ EXISTE (`xl`). Abaixo disso quem abre a
  // linha é o botão COM RÓTULO dentro da célula do nome — e a razão é medida: em
  // 390px, com o chevron mudo à esquerda e o `⋯` mudo à direita, o julgamento em
  // contexto fresco hesitou entre os dois ("é o chevron ou os três pontinhos?").
  // Dois controles sem palavra na mesma linha não dizem qual faz o quê.
  // `px-1` no celular: o `p-2` do kit dava 56px a uma coluna de 40px de botão.
  expandir: 'hidden xl:table-cell w-10 px-1 sm:px-2 print:hidden',
  // `whitespace-normal` anula o `whitespace-nowrap` do `TableCell` do kit SÓ
  // aqui: é o nome comprido que estourava a largura da tabela no celular.
  item: 'whitespace-normal',
  total: 'hidden sm:table-cell text-right',
  estoque: 'text-right',
  emUso: 'text-right',
  falta: 'hidden sm:table-cell text-right',
  filial: 'hidden xl:table-cell text-right',
  // A PRIMEIRA coluna de filial ganha um traço à esquerda: é ele que diz "daqui
  // para a direita a conta é por filial", sem gastar uma linha de cabeçalho de
  // grupo. Borda PARCIAL de propósito — `border-l` não é moldura de cartão (a
  // regra 6 de `consistencia.test.ts` procura `border`/`border-N` com raio).
  primeiraFilial: 'border-l',
  acoes: 'w-px px-1 text-right sm:px-2 print:hidden',
}

function Numero({ valor, className }: { valor: number; className?: string }) {
  return (
    <span className={cn('tabular-nums', className)}>{valor.toLocaleString('pt-BR')}</span>
  )
}

/** O selo vermelho do déficit. Idêntico ao de antes — é aviso diferente do "repor". */
function SeloFalta({ s }: { s: NumerosDoItem }) {
  if (s.falta <= 0) return <span className="text-muted-foreground">—</span>
  return (
    <Dica
      texto={`Compromisso já assumido: ${s.atrelados.toLocaleString('pt-BR')} reservado(s) e ${emUsoDoSaldo(s).toLocaleString('pt-BR')} em uso, para um total de ${s.total.toLocaleString('pt-BR')}`}
      className="inline-flex"
    >
      <Badge className="border-transparent bg-red-100 text-red-700 tabular-nums dark:bg-red-950 dark:text-red-300">
        faltam {s.falta.toLocaleString('pt-BR')}
      </Badge>
    </Dica>
  )
}

/**
 * "Ver por filial" — o mesmo estado do chevron, com a palavra escrita.
 *
 * ⚠ POR QUE ELE EXISTE, e a razão é medida, não estética: abaixo de `xl` a matriz
 * de filiais não cabe, e a linha ficava com DOIS controles mudos — o chevron à
 * esquerda e o `⋯` à direita. Num julgamento em contexto fresco a 390px, a
 * resposta a "onde você tocaria para ver as filiais?" hesitou entre os dois. Um
 * rótulo resolve o que nenhum ícone resolve.
 *
 * ⚠ O RÓTULO DIZ O SUBSTANTIVO. A primeira escrita era "Ver por filial (5)", e o
 * julgamento em contexto fresco tropeçou no parêntese: "não dá para saber se o (5)
 * é a quantidade de filiais ou algum outro número". Número solto entre parênteses
 * não é rótulo — é charada.
 *
 * `xl:hidden`: a partir de `xl` a coluna do chevron reaparece e este some — lá a
 * distribuição já está na linha, e o que a expansão acrescenta é o DETALHE.
 * `h-10`: alvo de toque de 40px, a régua de acessibilidade da casa.
 */
function BotaoVerPorFilial({
  aberta,
  onClick,
  item,
  filiais,
}: {
  aberta: boolean
  onClick: () => void
  item: string
  filiais: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={aberta}
      aria-label={
        aberta ? `Esconder os números por filial de ${item}` : `Ver os números por filial de ${item}`
      }
      // `whitespace-nowrap` está na classe porque a célula do nome é
      // `whitespace-normal`: sem ele o rótulo quebrava em duas linhas dentro de
      // uma coluna de 120px e acrescentava altura a CADA uma das 25 linhas.
      className="mt-1 -ml-1 flex h-10 items-center gap-1 rounded-md px-1 text-xs font-medium whitespace-nowrap text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none xl:hidden print:hidden"
    >
      <ChevronDown className={cn('size-4 transition-transform', aberta && 'rotate-180')} aria-hidden />
      {aberta
        ? 'Esconder as filiais'
        : filiais === 1
          ? 'Ver a filial'
          : `Ver as ${filiais} filiais`}
    </button>
  )
}

export function ItensTable({
  rows,
  filiais,
  minimos,
  escreve,
  filialPreset,
  filiaisTransferencia = [],
  cabecalhos,
}: {
  rows: LinhaDeItem[]
  /** As filiais que a linha compara — já recortadas pelo filtro da tela. */
  filiais: Filial[]
  minimos: MinimosPorItem
  /** `podeEscrever(operador?.papel)` — só quem lança vê o menu de ações. */
  escreve: boolean
  /** A filial pré-selecionada do diálogo, quando o filtro tem exatamente uma. */
  filialPreset: number | null
  /**
   * F31 · ITN-01 — ids das filiais em que este cargo escreve, quando há DUAS ou
   * mais. O atalho de transferir aparece na linha da filial que está aqui E que
   * tenha estoque > 0: não se transfere de uma prateleira vazia.
   */
  filiaisTransferencia?: readonly number[]
  /**
   * Rótulo, explicação curta e explicação inteira de cada número, vindos de
   * `NUMEROS_ITEM` (`src/lib/ajuda/conteudo/itens-por-quantidade.ts`) — a MESMA
   * fonte da página de ajuda. Desce por PROP a partir do Server Component.
   */
  cabecalhos: readonly MetaDeNumero[]
}) {
  const { estaAberta, alternar } = useExpandidas()

  // Os rótulos curtos são da TABELA, não da linha: resolvidos uma vez e reusados,
  // para todas as linhas nomearem a mesma filial do mesmo jeito.
  const rotulos = rotulosCurtosDeFilial(filiais)

  // O número de colunas visíveis no maior breakpoint — a linha de detalhe usa
  // `colSpan` e o navegador limita ao número real, então um teto serve.
  const colunas = 6 + filiais.length + (escreve ? 1 : 0)

  return (
    <QuadroDeTabela>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={COL.expandir}>
              <span className="sr-only">Ver os números de cada filial</span>
            </TableHead>
            <TableHead className={COL.item}>Item</TableHead>
            <TableHead className={COL.total}>
              <CabecalhoDeNumero cabecalhos={cabecalhos} chave="total" padrao="Total" />
            </TableHead>
            <TableHead className={COL.estoque}>
              <CabecalhoDeNumero
                cabecalhos={cabecalhos}
                chave="estoque"
                padrao="Em estoque"
              />
            </TableHead>
            <TableHead className={COL.emUso}>
              <CabecalhoDeNumero cabecalhos={cabecalhos} chave="emUso" padrao="Em uso" />
            </TableHead>
            <TableHead className={COL.falta}>
              <CabecalhoDeNumero cabecalhos={cabecalhos} chave="falta" padrao="Falta" />
            </TableHead>
            {/* UMA COLUNA POR FILIAL. O nome da filial é escrito UMA vez, no
                cabeçalho, e não 25 vezes na coluna — e a segunda linha diz qual
                dos quatro números a coluna mostra, para ninguém ter de adivinhar
                nem passar o mouse. `scope="col"` liga cada número ao seu nome
                para quem lê por leitor de tela. */}
            {filiais.map((f, i) => (
                <TableHead
                  key={f.id}
                  scope="col"
                  className={cn(COL.filial, i === 0 && COL.primeiraFilial)}
                >
                  <span className="flex flex-col items-end leading-tight">
                    <span>{rotulos[f.id] ?? f.nome}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      em estoque
                    </span>
                  </span>
                </TableHead>
            ))}
            {escreve && (
              <TableHead className={COL.acoes}>
                <span className="sr-only">Ações</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((linha) => {
            const aberta = estaAberta(String(linha.item_id))
            const emUso = emUsoDoSaldo(linha.saldo)
            const celulas = distribuicaoDoItem(linha, filiais, rotulos)
            return [
              <TableRow key={linha.item_id}>
                <TableCell className={COL.expandir}>
                  <BotaoExpandir
                    aberta={aberta}
                    onClick={() => alternar(String(linha.item_id))}
                    rotulo={
                      aberta
                        ? `Esconder os números por filial de ${linha.item}`
                        : `Ver os números por filial de ${linha.item}`
                    }
                  />
                </TableCell>
                <TableCell className={COL.item}>
                  <IdentidadeDoItem
                    item={linha.item}
                    grupo={linha.grupo}
                    tipoRotulo={linha.tipoRotulo}
                    estoqueConsolidado={linha.consolidado.estoque}
                    estoqueMinimo={minimoDoItem(minimos, linha.item_id)}
                  />
                  {/* Abaixo de `xl` a matriz não cabe, e é ESTE botão que leva aos
                      números por filial — com a palavra escrita, e não um chevron
                      mudo disputando o olho com o `⋯` do outro lado da linha. */}
                  <BotaoVerPorFilial
                    aberta={aberta}
                    onClick={() => alternar(String(linha.item_id))}
                    item={linha.item}
                    filiais={filiais.length}
                  />
                </TableCell>
                <TableCell className={cn(COL.total, 'text-muted-foreground')}>
                  <Numero valor={linha.saldo.total} />
                </TableCell>
                <TableCell className={COL.estoque}>
                  {/* A ÂNCORA. Um degrau acima dos outros três — o olho precisa de
                      um lugar por onde entrar na linha, e é este número que
                      responde "posso pegar agora?". */}
                  <Numero valor={linha.saldo.estoque} className="text-base font-semibold" />
                  {/* Quanto do estoque está numa filial que esta lista NÃO mostra
                      (filial desativada com saldo). Zero é o caso normal — quando
                      não é, as colunas de filial não fecham com o consolidado, e a
                      tela tem de dizer por quê ANTES de alguém somar na mão.
                      ⚠ A FRASE FOI ESCRITA TRÊS VEZES, e cada versão saiu de uma
                      dúvida medida. "3 fora da lista" (cinco das oito passadas do
                      julgamento pararam nela: "fora de QUE lista?"); "3 deles em
                      filial fora desta lista" (a dúvida virou outra: "esses 3 já
                      estão dentro do 31 ou são além dele?"); e enfim **"inclui 3
                      de filial fora desta lista"**, que responde a segunda com o
                      verbo — e é a MESMA palavra que a linha expansível já usava,
                      então as duas superfícies passaram a dizer a mesma frase.
                      Ela aparece em 2 dos 44 itens da prévia e em nenhum em
                      produção; raridade paga clareza. */}
                  {linha.foraDasFiliais > 0 && (
                    // `whitespace-normal` porque o `TableCell` do kit é
                    // `whitespace-nowrap`: sem ele esta frase de sete palavras
                    // esticava a COLUNA INTEIRA para 166px — em 390px isso
                    // devolvia a tabela para 381px numa caixa de 356 e jogava a
                    // coluna "Ações" para fora da tela. Uma nota que aparece em 2
                    // de 44 linhas não pode dimensionar a coluna das 44.
                    <span className="block text-xs whitespace-normal text-muted-foreground">
                      inclui {linha.foraDasFiliais.toLocaleString('pt-BR')} de filial
                      fora desta lista
                    </span>
                  )}
                </TableCell>
                <TableCell className={cn(COL.emUso, emUso === 0 && 'text-muted-foreground')}>
                  <Numero valor={emUso} />
                </TableCell>
                <TableCell className={COL.falta}>
                  <SeloFalta s={linha.saldo} />
                </TableCell>
                {celulas.map((c, i) => (
                  <TableCell
                    key={c.filialId}
                    className={cn(COL.filial, i === 0 && COL.primeiraFilial)}
                  >
                    <Numero
                      valor={c.numeros.estoque}
                      className={
                        c.numeros.estoque > 0 ? 'font-medium' : 'text-muted-foreground'
                      }
                    />
                  </TableCell>
                ))}
                {escreve && (
                  <TableCell className={COL.acoes}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-10 text-muted-foreground sm:size-8"
                          aria-label={`Ações de ${linha.item}`}
                        >
                          <MoreHorizontal className="size-4" aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel className="truncate">{linha.item}</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {/* O "+" da linha (OS-F9 · I6) mudou de casa, não de
                            comportamento: dispara o MESMO evento, com item e
                            filial pré-preenchidos. */}
                        <DropdownMenuItem
                          onSelect={() =>
                            dispararLancarItem({ itemId: linha.item_id, filialId: filialPreset })
                          }
                        >
                          <Plus className="size-4" aria-hidden />
                          Lançar quantidade
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/itens/historico?item=${linha.item_id}`}>
                            <ScrollText className="size-4" aria-hidden />
                            Ver histórico deste item
                          </Link>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                )}
              </TableRow>,

              aberta ? (
                <TableRow key={`${linha.item_id}-filiais`} className="hover:bg-transparent">
                  <TableCell colSpan={colunas} className="bg-muted/30 p-0">
                    <FiliaisDoItem
                      linha={linha}
                      celulas={celulas}
                      filiaisTransferencia={filiaisTransferencia}
                    />
                  </TableCell>
                </TableRow>
              ) : null,
            ]
          })}
        </TableBody>
      </Table>
    </QuadroDeTabela>
  )
}

/**
 * OS QUATRO NÚMEROS DE CADA FILIAL — o detalhe que a coluna nova não cabe.
 *
 * A coluna de filial responde "quanto tem para pegar ali". Esta linha responde o
 * resto: o total daquela filial, o que está com as pessoas, o reservado quando
 * existe, o déficit quando existe, e o atalho de transferir — que é da FILIAL DE
 * ORIGEM (ele diz de onde o item sai) e por isso mora aqui, e não na linha.
 *
 * ⚠ ELA CONTINUA EXISTINDO DE PROPÓSITO. Trazer a distribuição para a superfície
 * não a torna redundante: no celular ela é o único lugar onde os números por
 * filial aparecem, e em toda largura ela é o único lugar com os QUATRO números.
 */
function FiliaisDoItem({
  linha,
  celulas,
  filiaisTransferencia,
}: {
  linha: LinhaDeItem
  /** As MESMAS células que a matriz da linha usa — uma conta só (F43). */
  celulas: readonly CelulaDeFilial[]
  filiaisTransferencia: readonly number[]
}) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <p className="text-xs text-muted-foreground">
        {linha.item} em cada filial — na prateleira, com as pessoas e no acervo.
      </p>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2 xl:grid-cols-3">
        {celulas.map((celula) => {
          const c = celula.numeros
          const emUso = celula.emUso
          const podeTransferirDaqui =
            c.estoque > 0 && filiaisTransferencia.includes(celula.filialId)
          return (
            <div
              key={celula.filialId}
              className="flex items-baseline justify-between gap-3 border-b py-1"
            >
              <dt className="min-w-0 truncate font-medium">{celula.nome}</dt>
              <dd className="flex shrink-0 items-center gap-3 tabular-nums">
                <span className={cn(c.estoque > 0 ? 'font-semibold' : 'text-muted-foreground')}>
                  {c.estoque.toLocaleString('pt-BR')}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    em estoque
                  </span>
                </span>
                <span className={cn(emUso === 0 && 'text-muted-foreground')}>
                  {emUso.toLocaleString('pt-BR')}
                  <span className="ml-1 text-xs text-muted-foreground">em uso</span>
                </span>
                {/* O TOTAL DA FILIAL. A tabela antiga o escondia no `title` de cada
                    célula, junto com o reservado; a revisão adversarial da F42
                    apontou que ele tinha sumido no redesenho, e ele volta VISÍVEL —
                    é o número que fecha a conta da linha (estoque + em uso). */}
                <span className="text-muted-foreground">
                  {c.total.toLocaleString('pt-BR')}
                  <span className="ml-1 text-xs">no acervo</span>
                </span>
                {/* Reservado só aparece quando NÃO é zero, que é o caso normal desde
                    a conversão da F41. Uma coluna permanentemente vazia é ruído; o
                    número escondido, quando existe, é dado que falta. */}
                {c.atrelados > 0 && (
                  <span className="text-muted-foreground">
                    {c.atrelados.toLocaleString('pt-BR')}
                    <span className="ml-1 text-xs">reservado</span>
                  </span>
                )}
                {c.falta > 0 && (
                  <Badge className="border-transparent bg-red-100 text-red-700 tabular-nums dark:bg-red-950 dark:text-red-300">
                    faltam {c.falta.toLocaleString('pt-BR')}
                  </Badge>
                )}
                {podeTransferirDaqui && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground"
                    aria-label={`Transferir ${linha.item} de ${celula.nome} para outra filial`}
                    title={`Transferir de ${celula.nome}`}
                    onClick={() =>
                      dispararTransferirItem({
                        itemId: linha.item_id,
                        origemId: celula.filialId,
                      })
                    }
                  >
                    <ArrowRightLeft className="size-3.5" aria-hidden />
                  </Button>
                )}
              </dd>
            </div>
          )
        })}
      </dl>
      {/* Quanto do Total não está em nenhuma das filiais listadas (filial
          desativada com saldo). Zero é o caso normal — quando não é, a linha não
          fecha e a tela precisa dizer por quê. */}
      {linha.foraDasFiliais > 0 && (
        <p className="text-xs text-muted-foreground">
          Inclui {linha.foraDasFiliais.toLocaleString('pt-BR')} em estoque de filial fora
          desta lista.
        </p>
      )}
      {linha.consolidado.atrelados > 0 && (
        <p className="text-xs text-muted-foreground">
          {linha.consolidado.atrelados.toLocaleString('pt-BR')} reservado(s) para chamado —
          nenhuma tela cria reserva nova desde 31/08/2026; o número existe para o histórico.
        </p>
      )}
    </div>
  )
}

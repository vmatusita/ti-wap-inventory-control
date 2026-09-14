// Motor de validação + montagem do plano de import (OS-F7 / W1). Função pública:
// `validarCsvImport(buffer, filial, vocabulario)` → `ValidacaoImport` (contrato
// §1.5). Puro, determinístico: mesmo conteúdo → mesmo `arquivoHash` (sha-256).
// Nada de banco/UI — o vocabulário (unidades, categoria, situação, prefixos de
// patrimônio) chega por PARÂMETRO (`VocabularioImport`, `./vocabulario.ts`,
// F56 · Frente D): quem chama o motor é quem fala com o banco.
//
// Régua de validação (decisões do Johnny 16/07 + F7F 17/07/2026):
//   BLOQUEANTES (1+ ⇒ plano null): header fora dos 3 layouts; patrimônio COM valor
//   fora do formato canônico (vazio-na-prática NÃO bloqueia — ver abaixo); par
//   patrimônio+ST repetido no CSV (ou patrimônio repetido sem ST — colisão do índice
//   único); Site ≠ filial escolhida (após o vocabulário de unidades); categoria (Tipo)
//   desconhecida; estado não resolvível; estado alvo `descartado`; a FILIAL
//   SELECIONADA fora do vocabulário (F56 · Frente A/D — um bloqueante só, não N
//   `site_divergente`).
//   PATRIMÔNIO VAZIO-NA-PRÁTICA (F7F, decisão do Johnny 17/07/2026 — REVOGA a
//   não-inferência por hostname de 16/07): auto-preenche pelo patrimônio embutido no
//   HOSTNAME quando houver (aviso informativo `patrimonio_do_hostname`); senão importa
//   NULO com pendência "sem patrimônio físico" (aviso `patrimonio_vazio`, F7E).
//   AVISOS: sem_data_entrada; estado_em_uso_sem_colaborador; linha sem chave;
//   patrimonio_vazio; patrimonio_do_hostname (informativo, fora do fluxo de correção).
//
// F7B (17/07/2026): `validarCsvImport` ganhou um 4º parâmetro OPCIONAL com as
// correções da tela, aplicadas nas células ANTES de `extrairRegistros`. A régua
// acima é a MESMA — só a alimentação mudou. Sem correções, o comportamento é
// idêntico ao da F7 (retrocompatibilidade coberta por teste). `arquivoHash`
// continua sendo o sha-256 do buffer ORIGINAL, nunca do corrigido.

import { createHash } from 'node:crypto'
import { chavePatrimonio, SEM_PATRIMONIO } from '@/lib/patrimonio'
import { resolverPatrimonio } from './resolver-patrimonio'
import {
  agruparErros,
  aplicarCorrecoes,
  csvCorrigidoParaTexto,
} from './correcoes'
import {
  chaveServiceTag,
  extrairChamado,
  hojeIso,
  limparCampo,
  modeloSemMarca,
  normalizarServiceTag,
  parseColaboradorInventario,
  parseData,
  patrimonioVazio,
  resolverDataEntrega,
} from './deparas'
import {
  categoriasImportaveis,
  estadoPlanilha,
  filialDoVocabulario,
  mapearCategoria,
  mapearUnidade,
  type VocabularioImport,
} from './vocabulario'
import {
  decodificarCsv,
  detectarLayout,
  extrairRegistros,
  linhasDesalinhadas,
  mapaColunas,
  parseCsv,
  type CsvCru,
  type RegistroImport,
} from './parse'
import { lerXlsx, pareceXlsx } from './xlsx'
import {
  abreviar60,
  conferirTetos,
  ErroArquivoImport,
  LIMITES_CAMPO_PLANO,
  msgValorLongoDemais,
} from './limites'
import { aplicarOrcamentoResposta } from './orcamento'
import type {
  AtivoPlano,
  CorrecaoImport,
  ErroImport,
  EstadoPlanilha,
  FilialSelecionada,
  LayoutImport,
  ValidacaoImport,
} from './tipos'

/** Rótulo pt-BR de cada campo do `AtivoPlano`, para a mensagem de
 *  `valor_longo_demais` (F56 · Frente C, critério 12) — mesma chave de
 *  `LIMITES_CAMPO_PLANO`. */
const ROTULO_CAMPO_MOTOR: Record<keyof typeof LIMITES_CAMPO_PLANO, string> = {
  patrimonio: 'Patrimônio',
  patrimonioOriginal: 'Patrimônio (original)',
  serviceTag: 'Service Tag',
  categoria: 'Tipo',
  marca: 'Marca',
  modelo: 'Modelo',
  fornecedor: 'Fornecedor',
  memoria: 'Memória',
  armazenamento: 'Armazenamento',
  processador: 'Processador',
  hostname: 'Hostname',
  observacoes: 'Observação',
  dataEntrada: 'Data de entrada',
  dataAjuste: 'Data de ajuste',
  estadoAlvo: 'Situação',
  colaborador: 'Colaborador',
  setor: 'Setor',
  chamado: 'Chamado',
}

/** Resumo de uma lista de linhas para MENSAGEM (nunca para `grupo.linhas`, que
 *  fica sempre completo): as 10 primeiras + "e mais N" — F56 · Frente C, achado
 *  C2 §1.3. Embutir a lista INTEIRA em CADA mensagem de um grupo de N linhas
 *  fazia o corpo da resposta crescer O(N²) (N mensagens de tamanho O(N) cada):
 *  medido, N=1.142 → 14,4 MB de JSON só nesse card; N=2.000 → 45,4 MB (3,16×
 *  maior para 1,75× mais linhas — o crescimento quadrático, não linear). Limitar
 *  a mensagem a um resumo O(1) resolve a causa raiz; `grupo.linhas` (calculado
 *  uma vez por grupo, nunca reescrito por membro) já carrega a lista completa. */
const LINHAS_NA_MENSAGEM = 10
function resumoLinhas(linhas: readonly number[]): string {
  if (linhas.length <= LINHAS_NA_MENSAGEM) return linhas.join(', ')
  return `${linhas.slice(0, LINHAS_NA_MENSAGEM).join(', ')} e mais ${linhas.length - LINHAS_NA_MENSAGEM}`
}

// ---------------------------------------------------------------------------

// ATENÇÃO — `SEM_PATRIMONIO` (importado de @/lib/patrimonio) tem DOIS espaços de
// chave distintos e propositais (§ contrato): o DEDUPE (linhas repetidas no MESMO
// CSV) usa a tag UPPERCASED via `chaveServiceTag` (espelha coalesce(service_tag,'')
// do índice); a F7C (lookup em OUTRA filial) usa a tag RAW/exata (espelha o índice
// parcial do banco). Mesmo padrão dos com-patrimônio, replicado para os nulos.

/** sha-256 (hex) do conteúdo bruto do arquivo — estável entre reexecuções. */
export function hashConteudo(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  return createHash('sha256').update(bytes).digest('hex')
}

// Um registro que passou por TODA a validação de linha vira um candidato; a
// deduplicação (chave repetida) roda sobre os candidatos, depois das linhas.
type Candidato = { ativo: AtivoPlano; linha: number; chave: string }

/**
 * Monta os candidatos a `AtivoPlano` a partir dos registros crus, acumulando
 * bloqueantes/avisos de LINHA (Site, patrimônio, categoria, estado, data,
 * colaborador). A deduplicação entre linhas é feita depois, em validarCsvImport.
 *
 * `filialAlvo` é o `filial_id` da filial selecionada, ou `null` quando ela está
 * FORA do vocabulário (não cadastrada, ou inativa) — nesse caso a coluna Site
 * não é conferida linha a linha (quem chama já emitiu o bloqueante único
 * `filial_fora_do_vocabulario`; ver `analisar`).
 */
export function montarPlanoImport(
  registros: RegistroImport[],
  filialAlvo: number | null,
  filialNome: string,
  hoje: string,
  vocabulario: VocabularioImport,
  // F7J: linhas que o operador mandou FORÇAR o patrimônio cru (op `forcar_patrimonio`).
  forcados: ReadonlySet<number> = new Set(),
): { candidatos: Candidato[]; bloqueantes: ErroImport[]; avisos: ErroImport[] } {
  const bloqueantes: ErroImport[] = []
  const avisos: ErroImport[] = []
  const candidatos: Candidato[] = []

  for (const reg of registros) {
    let bloqueado = false
    const bloq = (coluna: string, valor: string, tipo: string, mensagem: string) => {
      bloqueantes.push({ linha: reg.linha, coluna, valor, tipo, mensagem })
      bloqueado = true
    }

    // 1) Site = filial escolhida (pelo vocabulário de unidades). Import nunca transfere.
    //
    // F56 (Frente A/D): com `filialAlvo` null — a filial selecionada está FORA do
    // vocabulário (não cadastrada ou inativa) — a coluna Site não é conferida linha
    // a linha. Quem chama (`analisar`) emite UM bloqueante `filial_fora_do_vocabulario`,
    // e o plano não sai. Antes da F56, TODA linha virava `site_divergente` com uma
    // mensagem que culpava o ARQUIVO pelo que é um buraco do CADASTRO.
    if (filialAlvo !== null) {
      const filialLinha = mapearUnidade(reg.site, vocabulario)
      if (filialLinha !== filialAlvo) {
        const nomeLinha = filialLinha === null ? null : filialDoVocabulario(filialLinha, vocabulario)?.nome
        bloq(
          'Site',
          reg.site,
          'site_divergente',
          filialLinha === null
            ? `Site "${reg.site}" não corresponde a nenhuma filial conhecida (esperado: ${filialNome})`
            : `Site "${reg.site}" (${nomeLinha ?? filialLinha}) ≠ filial selecionada (${filialNome}); o import não transfere ativo entre filiais`,
        )
      }
    }

    // 2) Patrimônio — a escada de precedência (F7-pós/F7J, decisão do Johnny 20/07/2026)
    //    vive em `resolverPatrimonio` (resolver-patrimonio.ts, PURO e testado). `eraVazio`
    //    fica aqui porque também decide o `patrimonio_original` mais abaixo. As mensagens
    //    de aviso/bloqueante são as MESMAS de antes; o cru fica em `patrimonioOriginal` e a
    //    dedupe usa o valor final (colisão reaparece).
    const eraVazio = patrimonioVazio(reg.patrimonio)
    const resPatr = resolverPatrimonio(
      reg.patrimonio,
      eraVazio,
      reg.hostname,
      forcados.has(reg.linha),
      vocabulario.prefixosPatrimonio,
    )
    let patrimonio: string | null = null
    if ('bloqueante' in resPatr) {
      bloq('Patrimônio', reg.patrimonio, resPatr.bloqueante.tipo, resPatr.bloqueante.mensagem)
    } else {
      patrimonio = resPatr.patrimonio
      if (resPatr.aviso) {
        avisos.push({
          linha: reg.linha,
          coluna: 'Patrimônio',
          valor: reg.patrimonio,
          tipo: resPatr.aviso.tipo,
          mensagem: resPatr.aviso.mensagem,
        })
      }
    }

    // 3) Categoria (Tipo) no vocabulário (desconhecido = bloqueante).
    const categoria = mapearCategoria(reg.tipo, vocabulario)
    if (!categoria) {
      bloq(
        'Tipo',
        reg.tipo,
        'categoria_desconhecida',
        `Tipo "${reg.tipo}" fora do vocabulário (${categoriasImportaveis(vocabulario)
          .map((c) => c.rotulo)
          .join(', ')})`,
      )
    }

    // 4) Estado (precedência Situação>Status). Desconhecido/descartado = bloqueante.
    const estado = estadoPlanilha(reg.status, reg.situacao, vocabulario)
    if (!estado) {
      bloq(
        'Situação',
        `Status="${reg.status}" Situação="${reg.situacao}"`,
        'estado_desconhecido',
        'Status/Situação sem estado resolvível no vocabulário do import',
      )
    } else if (estado === 'descartado') {
      bloq(
        'Situação',
        `Status="${reg.status}" Situação="${reg.situacao}"`,
        'estado_descartado',
        'ativo descartado num CSV de startup é provável lixo — remova a linha ou corrija a situação',
      )
    }

    // Patrimônio null (vazio-na-prática) NÃO bloqueia — só invalidez o faz (via
    // `bloq`). Por isso o guard não olha mais `!patrimonio`.
    if (bloqueado || !categoria || !estado) continue

    // F56 · Frente B (Decisão 4) — estreitamento EXPLÍCITO de `estado` para
    // `EstadoAlvoImport` (sem 'descartado'), para `AtivoPlano.estadoAlvo`
    // abaixo. Em TEMPO DE EXECUÇÃO este `continue` é morto: o `else if
    // (estado === 'descartado')` lá em cima (item 4) já chamou `bloq(...)`,
    // que já forçou o `continue` da linha acima — nenhum registro com
    // `estado === 'descartado'` sobrevive até aqui. Mas o TypeScript não
    // enxerga essa dependência CRUZADA entre a variável `bloqueado` (setada
    // dentro de `bloq`) e o valor de `estado`: sem esta linha, `estado`
    // continuaria tipado como `EstadoPlanilha` (que INCLUI 'descartado') no
    // resto da função, e `estadoAlvo: estado` abaixo não compilaria contra
    // `EstadoAlvoImport`. É o estreitamento que a Decisão 4 pede.
    if (estado === 'descartado') continue

    // ------- linha válida: monta o AtivoPlano (campos do alinhamento F7 §3) ---
    const serviceTag = normalizarServiceTag(reg.serviceTag)

    // Datas (F7E). Inclusão = `parseData` (dd/MM/aaaa). Entrega = `resolverDataEntrega`,
    // que aceita `dd/MMM` puxando o ano da inclusão. dataEntrada = mais antiga válida
    // (não-futura) entre Inclusão e Entrega RESOLVIDA (regra F7, com a entrega agora
    // participando). dataAjuste = entrega válida-não-futura ?? dataEntrada ?? null.
    const inclusao = parseData(reg.dataInclusao, hoje)
    const inclusaoIso = inclusao.iso !== null && !inclusao.futura ? inclusao.iso : null
    const entrega = resolverDataEntrega(reg.dataEntrega, inclusaoIso, hoje)
    const entregaIso = entrega.iso !== null && !entrega.futura ? entrega.iso : null
    const datasValidas = [inclusaoIso, entregaIso].filter((d): d is string => d !== null)
    const dataEntrada = datasValidas.length > 0 ? datasValidas.sort()[0]! : null
    const dataAjuste = entregaIso ?? dataEntrada
    if (dataEntrada === null) {
      avisos.push({
        linha: reg.linha,
        coluna: 'Data de Inclusão',
        valor: `Inclusão="${reg.dataInclusao}" Entrega="${reg.dataEntrega}"`,
        tipo: 'sem_data_entrada',
        mensagem:
          'sem data de entrada válida — importado marcado como carga, fora dos relatórios do período',
      })
    }

    const { colaborador, setor } = parseColaboradorInventario(reg.colaborador)
    if ((estado === 'em_uso' || estado === 'emprestado') && colaborador === null) {
      avisos.push({
        linha: reg.linha,
        coluna: 'Colaborador',
        valor: reg.colaborador,
        tipo: 'estado_em_uso_sem_colaborador',
        mensagem: `estado "${estado}" sem colaborador informado no CSV`,
      })
    }

    // F7K: modelo que repete a marca no início ("HP" + "HP Pro …") é auto-corrigido para
    // não duplicar no rótulo marca+modelo ("HP HP …" → "HP Pro …").
    const marca = limparCampo(reg.marca)
    const ativo: AtivoPlano = {
      patrimonio,
      // F7-pós: marcador de ausência (`n/a`, `SEM PATRIMONIO`…) NÃO é preservado no
      // `patrimonio_original` — é ruído que apareceria como se fosse o patrimônio (RPC
      // faz nullif('') → NULL; a ficha mostra "—"). Valor com conteúdo real (fora de
      // formato, ex.: `12345`) SEGUE preservado p/ auditoria/correção.
      patrimonioOriginal: eraVazio ? '' : reg.patrimonio.trim(),
      serviceTag,
      categoria,
      marca,
      modelo: modeloSemMarca(marca, limparCampo(reg.modelo)),
      fornecedor: limparCampo(reg.fornecedor),
      memoria: limparCampo(reg.memoria),
      armazenamento: limparCampo(reg.armazenamento),
      processador: limparCampo(reg.processador),
      hostname: limparCampo(reg.hostname),
      observacoes: limparCampo(reg.observacao),
      dataEntrada,
      dataAjuste,
      estadoAlvo: estado,
      colaborador,
      setor,
      chamado: extrairChamado(reg.glpi),
    }

    // F56 · Frente C (critério 12) — célula acima do teto do CAMPO: o motor
    // RECUSA a linha ANTES de virar `AtivoPlano` (nunca trunca o valor do plano —
    // a doutrina "recusar, nunca cortar" da dívida T). `ErroImport.valor` leva só
    // os 60 primeiros caracteres (exibição); o plano, quando existir, nunca leva
    // este ativo — a linha nem chega a `candidatos.push` abaixo.
    for (const campo of Object.keys(LIMITES_CAMPO_PLANO) as (keyof AtivoPlano)[]) {
      const valorCampo = ativo[campo]
      if (typeof valorCampo !== 'string') continue
      const limite = LIMITES_CAMPO_PLANO[campo]
      if (valorCampo.length > limite) {
        bloq(
          ROTULO_CAMPO_MOTOR[campo],
          abreviar60(valorCampo),
          'valor_longo_demais',
          msgValorLongoDemais(ROTULO_CAMPO_MOTOR[campo], reg.linha, valorCampo.length, limite),
        )
      }
    }
    if (bloqueado) continue

    // Chave de DEDUPE (linhas repetidas no MESMO CSV). Com patrimônio → a chave da
    // F7 (tag UPPERCASED, espelha coalesce(service_tag,'') do índice). Sem patrimônio
    // e com tag → `∅::<tag-uppercased>` (o índice parcial novo: duas linhas sem
    // patrimônio com a mesma tag colidem). Sem patrimônio e sem tag → chave ÚNICA por
    // linha (`∅::sem-tag::<linha>`): sem identidade não há como deduplicar.
    const chaveDedupe =
      patrimonio === null
        ? serviceTag === null
          ? `${SEM_PATRIMONIO}::sem-tag::${reg.linha}`
          : `${SEM_PATRIMONIO}::${chaveServiceTag(serviceTag)}`
        : chavePatrimonio(patrimonio, chaveServiceTag(serviceTag))
    candidatos.push({
      ativo,
      linha: reg.linha,
      chave: chaveDedupe,
    })
  }

  return { candidatos, bloqueantes, avisos }
}

// ---------------------------------------------------------------------------

/**
 * Núcleo do motor (OS-F7 / W1, extraído na F7G). Trabalha sobre o `CsvCru` já
 * pronto — venha ele do PapaParse (CSV) ou do leitor de xlsx — mais o
 * `arquivoHash` do arquivo original. Acumula bloqueantes/avisos (agrupados para
 * correção), monta o plano aplicável (null se houver bloqueante) e o resumo.
 *
 * `existentesEmOutraFilial` (F7C): chave `chavePatrimonio(patrimonio, serviceTag)`
 * (ou `∅::<tag>` sem patrimônio) → nome da filial onde o ativo JÁ está cadastrado.
 * Vazio = comportamento anterior, byte a byte. `correcoes` (F7B): validação DO ZERO
 * sobre as células corrigidas, nunca patch incremental (OS-F7B §8.1). `vocabulario`
 * (F56 · Frente D): o vocabulário de unidades/categoria/situação/prefixos, lido do
 * banco por quem chama — o motor nunca o busca sozinho.
 */
function analisar(
  csvOriginal: CsvCru,
  arquivoHash: string,
  filial: FilialSelecionada,
  hoje: string,
  correcoes: CorrecaoImport[],
  existentesEmOutraFilial: ReadonlyMap<string, string>,
  vocabulario: VocabularioImport,
): ValidacaoImport {
  // F56 · Frente C (Decisão 6, critério 10) — PRIMEIRA LINHA de `analisar()`, antes
  // de qualquer outra validação: os tetos de linhas/colunas/conteúdo, IGUAIS para
  // CSV e `.xlsx` (o CSV não tinha teto nenhum até aqui). Lança `ErroArquivoImport`
  // — atravessa o `catch` da action até o operador, como o `.xlsx` já fazia.
  conferirTetos(csvOriginal)

  const det = detectarLayout(csvOriginal.header)

  const bloqueantes: ErroImport[] = []
  const avisos: ErroImport[] = []

  // Header fora dos 3 layouts → bloqueante único; sem plano, resumo best-effort.
  // Correções NÃO se aplicam (estrutura/arquivo errado não se corrige por célula
  // — OS-F7B §8.6): a única saída é trocar o arquivo.
  if (det.layout === null) {
    const erro: ErroImport = {
      linha: 1,
      coluna: 'cabeçalho',
      valor: csvOriginal.header.filter((h) => h.trim() !== '').join(' | '),
      tipo: 'header_invalido',
      mensagem:
        `Cabeçalho não corresponde a nenhum layout conhecido (colunas18/colunas16/colunas20). ` +
        `Mais próximo: ${det.maisProximo}. ` +
        `Faltando: [${det.faltando.join(', ') || '—'}]. Sobrando: [${det.sobrando.join(', ') || '—'}]`,
    }
    bloqueantes.push(erro)
    return aplicarOrcamentoResposta({
      bloqueantes,
      avisos,
      grupos: [
        { tipo: 'header_invalido', chave: '', linhas: [1], erros: [erro], correcao: { kind: 'nenhuma' } },
      ],
      contexto: {},
      correcoes: { aplicadas: 0, porOp: correcoes.map(() => 0) },
      candidatos: [],
      plano: null,
      resumo: {
        criar: 0, semData: 0, semPatrimonio: 0, semServiceTag: 0, patrimonioDoHostname: 0, conflitos: 0,
        layout: det.maisProximo, linhasRemovidas: 0,
        detalhe: { reduzido: false, totalBloqueantes: 1, totalAvisos: 0, mantidosPorTipo: null },
      },
    })
  }
  const layout: LayoutImport = det.layout

  // F56 · Frente C (Decisão 8) — desalinhamento: linha com célula A MAIS (valor
  // além da largura útil do cabeçalho) ou A MENOS. Roda sobre o CSV ORIGINAL,
  // ANTES das correções — estrutura não se corrige por célula, e uma linha
  // desalinhada tem o mapeamento célula↔coluna quebrado: deixá-la seguir para
  // `extrairRegistros` leria valor da coluna ERRADA em silêncio (o próprio
  // defeito que esta régua existe para impedir). As linhas afetadas são
  // excluídas do CSV que segue adiante; cada uma vira UM bloqueante aqui.
  const desalinhadas = linhasDesalinhadas(csvOriginal)
  const linhasDesalinhadasSet = new Set(desalinhadas.map((d) => d.linha))
  if (desalinhadas.length > 0) {
    const porLinhaOriginal = new Map(csvOriginal.linhas.map((l) => [l.linha, l.celulas]))
    for (const d of desalinhadas) {
      const celulas = porLinhaOriginal.get(d.linha) ?? []
      bloqueantes.push({
        linha: d.linha,
        coluna: '—',
        valor: celulas.filter((c) => c !== '').join(' | '),
        tipo: 'linha_desalinhada',
        mensagem: `a linha ${d.linha} tem ${d.contagemCelulas} células; o cabeçalho tem ${d.larguraUtil} colunas`,
      })
    }
  }
  const csvSemDesalinhamento: CsvCru =
    linhasDesalinhadasSet.size === 0
      ? csvOriginal
      : {
          header: csvOriginal.header,
          linhas: csvOriginal.linhas.filter((l) => !linhasDesalinhadasSet.has(l.linha)),
        }

  // ---- F7B: correções nas CÉLULAS, antes da extração dos registros ----------
  const {
    csv,
    porOp,
    linhasRemovidas,
    invalidas,
  } = aplicarCorrecoes(csvSemDesalinhamento, correcoes, mapaColunas(csvOriginal.header), vocabulario, filial.nome)
  bloqueantes.push(...invalidas)

  const { registros, descartadas, totalLinhasDados } = extrairRegistros(csv)

  // linha sem Site E sem patrimônio → descartada com aviso (padrão da F4)
  for (const d of descartadas) {
    avisos.push({
      linha: d.linha,
      coluna: '—',
      valor: d.conteudo,
      tipo: 'linha_sem_chave',
      mensagem: 'linha sem Site e sem patrimônio (sobra de edição) — descartada',
    })
  }

  // F56 (Frente A → Frente D) — a filial selecionada fora do vocabulário de
  // unidades (não cadastrada OU inativa) é UM erro de cadastro, e não N erros de
  // arquivo: o GATILHO FINAL (fato 5 da ordem) — dispara quando `filial.id` não
  // está em `vocabulario.filiais` como filial ATIVA. Um bloqueante só, com a
  // mensagem verdadeira; o resto da análise segue (os outros erros das linhas
  // continuam úteis), mas o plano não sai.
  const registroFilial = filialDoVocabulario(filial.id, vocabulario)
  const filialValida = registroFilial !== null && registroFilial.ativa
  if (!filialValida) {
    bloqueantes.push({
      linha: 0,
      coluna: 'Site',
      valor: filial.nome,
      tipo: 'filial_fora_do_vocabulario',
      mensagem:
        `A filial selecionada (${filial.nome}) não está no vocabulário de unidades do import, ou está ` +
        'inativa, e por isso nenhuma linha pode ser conferida pela coluna Site. O problema não está no ' +
        'arquivo: cadastre ou reative a filial em Administração › Filiais antes de importar.',
    })
  }
  const filialAlvo = filialValida ? filial.id : null
  // F7J: linhas que o operador mandou FORÇAR o patrimônio cru (op `forcar_patrimonio`).
  const forcados = new Set(
    correcoes.filter((c) => c.op === 'forcar_patrimonio').map((c) => c.linha),
  )
  const { candidatos, bloqueantes: bloqLinha, avisos: avisoLinha } = montarPlanoImport(
    registros,
    filialAlvo,
    filial.nome,
    hoje,
    vocabulario,
    forcados,
  )
  bloqueantes.push(...bloqLinha)
  avisos.push(...avisoLinha)

  // Deduplicação: par patrimônio+ST repetido dentro do CSV (colisão do índice
  // único coalesce(service_tag,'')). Um bloqueante por linha do grupo.
  const porChave = new Map<string, Candidato[]>()
  for (const c of candidatos) {
    const g = porChave.get(c.chave)
    if (g) g.push(c)
    else porChave.set(c.chave, [c])
  }
  for (const grupo of porChave.values()) {
    if (grupo.length < 2) continue
    const linhas = grupo.map((c) => c.linha).sort((a, b) => a - b)
    // F56 · Frente C (achado C2 §1.3) — calculado UMA VEZ por grupo, nunca dentro
    // do laço por membro (era isso que fazia o corpo crescer O(N²) — ver o
    // comentário de `resumoLinhas`, acima).
    const linhasResumo = resumoLinhas(linhas)
    const ref = grupo[0]!.ativo
    // F7E — colisão entre linhas SEM patrimônio: a identidade é a service tag (índice
    // parcial novo). Nulo-sem-tag nunca chega aqui (chave única por linha), então todo
    // membro deste grupo tem tag. Vira o MESMO bloqueante de duplicata (kind duplicata).
    if (ref.patrimonio === null) {
      for (const c of grupo) {
        bloqueantes.push({
          linha: c.linha,
          coluna: 'Service Tag',
          valor: c.ativo.serviceTag ?? '',
          tipo: 'par_duplicado',
          mensagem: `service tag "${c.ativo.serviceTag}" repetida em linhas sem patrimônio (colide no índice parcial de service tag) — linhas ${linhasResumo}`,
        })
      }
      continue
    }
    // Com patrimônio: régua da F7, intocada. `patrimonio` é não-nulo neste ramo
    // (o espaço de chave `∅::…` dos nulos nunca cai no mesmo balde de um canônico).
    const semTag = ref.serviceTag === null
    for (const c of grupo) {
      const patr = c.ativo.patrimonio!
      bloqueantes.push({
        linha: c.linha,
        coluna: semTag ? 'Patrimônio' : 'Service Tag',
        valor: semTag ? patr : `${patr} + ${c.ativo.serviceTag ?? ''}`,
        tipo: semTag ? 'patrimonio_duplicado_sem_service_tag' : 'par_duplicado',
        mensagem: semTag
          ? `patrimônio ${patr} repetido sem service tag (colide no índice único) — linhas ${linhasResumo}`
          : `par patrimônio+service tag repetido no CSV — linhas ${linhasResumo}`,
      })
    }
  }

  // F7C → F24 — o par já existe no banco, em OUTRA filial.
  //
  // A régua NASCEU bloqueante (F7C, 17/07/2026) por uma razão mecânica: o índice único
  // era GLOBAL, o "Substituir tudo" só apaga o acervo da filial SELECIONADA, e portanto
  // o ativo da outra filial sobrevivia ao DELETE e fazia o INSERT da RPC estourar —
  // depois do backup e da confirmação, sem que o preview tivesse apontado a linha.
  //
  // A F24 (decisão do Johnny, 30/07/2026) tirou essa mecânica do caminho: a identidade
  // virou POR FILIAL (migration 0091), então os dois cadastros PODEM coexistir e não há
  // mais colisão nenhuma a evitar. O que sobra é um problema de NEGÓCIO — dois cadastros
  // do mesmo equipamento, e alguém precisa olhar os dois e decidir qual é o certo. Isso
  // não é trabalho de quem está importando um CSV às pressas: é trabalho da mesa de
  // conflitos em /pendencias, que mostra os lados juntos, com o histórico de cada um.
  //
  // Por isso a detecção CONTINUA IGUAL (a 2ª passada, a query, as chaves — nada mudou) e
  // só o VEREDITO mudou: `avisos` no lugar de `bloqueantes`. Não há campo de severidade
  // no `ErroImport`; o tier É o array em que o erro cai, e a UI o deriva daí.
  //
  // O que NÃO mudou: o import continua sem TRANSFERIR ativo entre filiais. Linha com
  // Site de outra filial segue bloqueante (`site_divergente`, item 1 de
  // `montarPlanoImport`) — transferência se faz pelo sistema, com movimentação e
  // histórico. Aqui o Site é o desta filial; o que colide é a identidade.
  const filialPorLinha = new Map<number, string>()
  for (const c of candidatos) {
    // F7E — a chaveBanco espelha os DOIS índices do banco: com patrimônio → o par
    // (patrimonio, service_tag); sem patrimônio → `∅::<service_tag>` com a tag RAW,
    // EXATA (o índice parcial `coalesce(service_tag,'')` — NÃO uppercased, ao
    // contrário do dedupe). Nulo-sem-tag cai em `∅::` e nunca casa (a action nunca
    // monta essa chave: só consulta por tags não-vazias). A action (W3) constrói o
    // mapa `existentesEmOutraFilial` com estas MESMAS chaves.
    const chaveBanco =
      c.ativo.patrimonio === null
        ? `${SEM_PATRIMONIO}::${c.ativo.serviceTag ?? ''}`
        : chavePatrimonio(c.ativo.patrimonio, c.ativo.serviceTag)
    const filialDono = existentesEmOutraFilial.get(chaveBanco)
    if (filialDono === undefined) continue
    filialPorLinha.set(c.linha, filialDono)
    // Rótulo do erro: patrimônio quando há; senão a service tag (nulo-com-tag).
    const rotulo = c.ativo.patrimonio ?? `service tag ${c.ativo.serviceTag}`
    avisos.push({
      linha: c.linha,
      coluna: 'Patrimônio',
      valor: c.ativo.patrimonio
        ? c.ativo.serviceTag
          ? `${c.ativo.patrimonio} + ${c.ativo.serviceTag}`
          : c.ativo.patrimonio
        : `sem patrimônio + ${c.ativo.serviceTag}`,
      tipo: 'patrimonio_em_outra_filial',
      mensagem: `${rotulo} também está cadastrado na filial ${filialDono} — esta linha importa e abre um conflito entre filiais para resolver em Pendências. O import não transfere ativo entre filiais; remover a linha continua sendo opcional.`,
    })
  }

  const ativos = candidatos.map((c) => c.ativo)

  // F7B §8.4 — removeu tudo, não sobrou ativo: a RPC já exige ≥ 1; a UI avisa
  // antes. Condicionado a `linhasRemovidas > 0` de propósito: sem correções, o
  // comportamento da F7 fica byte-a-byte igual (retrocompatibilidade).
  if (linhasRemovidas > 0 && ativos.length === 0) {
    bloqueantes.push({
      linha: 0,
      coluna: '—',
      valor: `${linhasRemovidas} linha(s) removida(s)`,
      tipo: 'plano_vazio',
      mensagem:
        'todas as linhas foram removidas — o import de startup precisa de ao menos 1 ativo',
    })
  }

  const semData = ativos.filter((a) => a.dataEntrada === null).length
  const semPatrimonio = ativos.filter((a) => a.patrimonio === null).length
  // F15 — nº de ativos do plano SEM service tag (importam com pendência 'sem service
  // tag'; a régua de obrigatoriedade vale só no cadastro manual, nunca no import).
  // Deriva do resultado final, como semData/semPatrimonio — só informa (aviso âmbar).
  const semServiceTag = ativos.filter((a) => a.serviceTag === null).length
  // F7F — nº de linhas auto-preenchidas pelo hostname. Deriva do resultado final (os
  // avisos), como semData/semPatrimonio, e não de estado intermediário do loop.
  const patrimonioDoHostname = avisos.filter((a) => a.tipo === 'patrimonio_do_hostname').length
  // F24 — nº de linhas que abrem conflito entre filiais. Deriva dos AVISOS (onde a régua
  // F7C passou a cair), no mesmo padrão de `patrimonioDoHostname`, e não do
  // `filialPorLinha`: assim o contador é sempre o que a tela mostra, e não um estado
  // intermediário que poderia divergir se a régua mudasse de novo.
  const conflitos = avisos.filter((a) => a.tipo === 'patrimonio_em_outra_filial').length
  // `detalhe` é placeholder aqui — SEMPRE recalculado por `aplicarOrcamentoResposta`
  // (chamado em todo `return` abaixo), que é quem de fato decide se reduziu.
  const resumo: ValidacaoImport['resumo'] = {
    criar: ativos.length, semData, semPatrimonio, semServiceTag, patrimonioDoHostname, conflitos, layout, linhasRemovidas,
    detalhe: { reduzido: false, totalBloqueantes: 0, totalAvisos: 0, mantidosPorTipo: null },
  }

  // F7B — agrupamento + contexto das linhas com erro/aviso (a tela corrige a
  // linha inteira, não a célula solta). `registros` já vem CORRIGIDO.
  const grupos = agruparErros(bloqueantes, avisos, registros, vocabulario, filial.nome, filialPorLinha)
  const porNumero = new Map(registros.map((r) => [r.linha, r]))
  const contexto: Record<number, RegistroImport> = {}
  for (const erro of [...bloqueantes, ...avisos]) {
    const reg = porNumero.get(erro.linha)
    if (reg) contexto[erro.linha] = reg
  }
  const infoCorrecoes = { aplicadas: porOp.filter((n) => n > 0).length, porOp }
  // F7C — sobrevive ao bloqueante (ao contrário do plano): é com isto que a action
  // pergunta ao banco quais pares já existem em outra filial.
  const listaCandidatos = candidatos.map((c) => ({
    linha: c.linha,
    patrimonio: c.ativo.patrimonio,
    serviceTag: c.ativo.serviceTag,
  }))

  if (bloqueantes.length > 0) {
    return aplicarOrcamentoResposta({
      bloqueantes,
      avisos,
      grupos,
      contexto,
      correcoes: infoCorrecoes,
      candidatos: listaCandidatos,
      plano: null,
      resumo,
    })
  }

  const plano: ValidacaoImport['plano'] = {
    filialId: filial.id,
    arquivoHash,
    totalLinhasDados,
    ativos,
  }
  return aplicarOrcamentoResposta({
    bloqueantes,
    avisos,
    grupos,
    contexto,
    correcoes: infoCorrecoes,
    candidatos: listaCandidatos,
    plano,
    resumo,
  })
}

/**
 * Função pública do motor (CSV). Recebe o buffer bruto do arquivo, a filial e o
 * vocabulário do import (unidades/categoria/situação/prefixos — lido do banco por
 * quem chama, F56 · Frente D); devolve o preview + o plano aplicável (null se
 * houver bloqueante). SÍNCRONA — o caminho CSV não tem I/O assíncrono. `hoje` é
 * injetável só para os testes (detecção de data futura determinística).
 */
export function validarCsvImport(
  conteudo: ArrayBuffer | Uint8Array,
  filial: FilialSelecionada,
  vocabulario: VocabularioImport,
  hoje: string = hojeIso(),
  correcoes: CorrecaoImport[] = [],
  existentesEmOutraFilial: ReadonlyMap<string, string> = new Map(),
): ValidacaoImport {
  // sha-256 do buffer ORIGINAL — as correções NÃO alteram o arquivo enviado
  // (invariante da F7: auditoria = arquivo + correções → plano).
  const arquivoHash = hashConteudo(conteudo)
  const { texto } = decodificarCsv(conteudo)
  const csvOriginal = parseCsv(texto)
  return analisar(csvOriginal, arquivoHash, filial, hoje, correcoes, existentesEmOutraFilial, vocabulario)
}

/**
 * F7G — entrada única para QUALQUER arquivo de import (CSV ou XLSX). Roteia pelo
 * CONTEÚDO (assinatura ZIP), não pela extensão: xlsx → `lerXlsx` (datas já em
 * `dd/MM/aaaa` com ano real, texto UTF-8, sem `#######`); senão → o caminho CSV,
 * byte a byte igual ao de sempre. ASSÍNCRONA porque `lerXlsx` (ExcelJS) é assíncrono.
 * Depois de virar `CsvCru`, o resto do motor é EXATAMENTE o mesmo — inclusive as
 * correções (que endereçam a linha física, preservada pelo leitor) e o `arquivoHash`
 * (do arquivo original enviado, seja CSV ou XLSX).
 */
export async function validarArquivoImport(
  conteudo: ArrayBuffer | Uint8Array,
  filial: FilialSelecionada,
  vocabulario: VocabularioImport,
  hoje: string = hojeIso(),
  correcoes: CorrecaoImport[] = [],
  existentesEmOutraFilial: ReadonlyMap<string, string> = new Map(),
): Promise<ValidacaoImport> {
  if (pareceXlsx(conteudo)) {
    const arquivoHash = hashConteudo(conteudo)
    const csvOriginal = await lerXlsx(conteudo)
    return analisar(csvOriginal, arquivoHash, filial, hoje, correcoes, existentesEmOutraFilial, vocabulario)
  }
  return validarCsvImport(conteudo, filial, vocabulario, hoje, correcoes, existentesEmOutraFilial)
}

/**
 * F7G — "Baixar arquivo corrigido" para QUALQUER entrada. xlsx → lê a planilha e
 * reserializa as células JÁ normalizadas (datas em `dd/MM/aaaa`) como CSV corrigido;
 * CSV → o `csvCorrigido` de sempre. O artefato baixado é sempre um CSV reimportável —
 * o retrato do que entrou no plano. Async por causa do `lerXlsx`. Fica aqui (server-
 * only) e não em correcoes.ts, que é folha client-safe (a UI a usa no preview ao vivo).
 */
export async function csvCorrigidoDeArquivo(
  conteudo: ArrayBuffer | Uint8Array,
  correcoes: CorrecaoImport[],
  vocabulario: VocabularioImport,
  filialNome?: string,
): Promise<string> {
  // F56 · revisão adversarial final (achado médio) — o "Baixar corrigido" passa pelas
  // MESMAS duas travas estruturais de `analisar()`, com o mesmo leitor. Antes daqui ele
  // lia o arquivo e aplicava as correções sem teto nenhum de linhas/colunas/conteúdo (os
  // corpos 4 e 5 da Decisão 6 são desta ação) e reserializava linha DESALINHADA como se
  // estivesse certa — com o valor na coluna errada, no arquivo que o operador reimporta.
  const csv = pareceXlsx(conteudo) ? await lerXlsx(conteudo) : parseCsv(decodificarCsv(conteudo).texto)
  conferirTetos(csv)
  const desalinhadas = linhasDesalinhadas(csv)
  if (desalinhadas.length > 0) {
    const primeira = desalinhadas[0]!
    const quantas =
      desalinhadas.length === 1 ? '1 linha desalinhada' : `${desalinhadas.length} linhas desalinhadas`
    throw new ErroArquivoImport(
      `O arquivo tem ${quantas} (a primeira é a linha ${primeira.linha}: ${primeira.contagemCelulas} células ` +
        `para ${primeira.larguraUtil} colunas do cabeçalho). Linha desalinhada se corrige no próprio arquivo — ` +
        'ajuste e analise de novo antes de baixar o corrigido.',
    )
  }
  const { csv: corrigido } = aplicarCorrecoes(csv, correcoes, mapaColunas(csv.header), vocabulario, filialNome)
  return csvCorrigidoParaTexto(corrigido)
}

// Re-export do tipo de estado para consumidores que só importam daqui.
export type { EstadoPlanilha }
